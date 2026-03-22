import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../AuthContext";
import { useBoard } from "../BoardContext";
import { useNavigate } from "react-router-dom";
import PostIt from "../components/PostIt";
import CheckoutRedirectModal from "../components/CheckoutRedirectModal";
import { Info, ArrowLeft, ArrowRight, Undo2, Trash2 } from "lucide-react";
import simplify from "simplify-js";

const SIZE_PRICES = { S: 1, M: 3, L: 5 };
const PROTECTION_PRICE = 10;
const LONG_PRESS_MS = 600;

const COLOR_CONFIG = {
  Y: { bg: "#FEF08A", label: "Yellow" },
  P: { bg: "#FBCFE8", label: "Pink" },
  B: { bg: "#BAE6FD", label: "Blue" },
};

const SIZE_CONFIG = {
  S: { px: 120, canvas: 400, icon: 28, label: "Small", price: 1 },
  M: { px: 160, canvas: 500, icon: 42, label: "Medium", price: 3 },
  L: { px: 220, canvas: 600, icon: 58, label: "Large", price: 5 },
};

// Brush presets
const BRUSH_PRESETS = [
  { size: 2, label: "Fine" },
  { size: 5, label: "Medium" },
  { size: 10, label: "Thick" },
  { size: 18, label: "Bold" },
];

// Palette offered inside the drawing step
const PALETTE = [
  "#000000",
  "#374151",
  "#dc2626",
  "#ea580c",
  "#ca8a04",
  "#16a34a",
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#ffffff",
];

// Board-space half-sizes — must match PostIt's Tailwind classes exactly
const HALF_SIZE = { S: 64, M: 96, L: 128 };

function overlapsProtected(x, y, size, p) {
  return (
    Math.abs(x - p.position_x) < HALF_SIZE[size] + HALF_SIZE[p.size] &&
    Math.abs(y - p.position_y) < HALF_SIZE[size] + HALF_SIZE[p.size]
  );
}

// ─── Step dots ──────────────────────────────────────────────────────────────
function StepDots({ step }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {[1, 2, 3].map((n) => (
        <div
          key={n}
          className="rounded-full transition-all duration-300"
          style={{
            width: n === step ? 24 : 8,
            height: 8,
            background:
              n === step ? "#0f172a" : n < step ? "#94a3b8" : "#e2e8f0",
          }}
        />
      ))}
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────
function Draw() {
  const [step, setStep] = useState(1);
  const [stepKey, setStepKey] = useState(0);

  const [size, setSize] = useState("S");
  const [color, setColor] = useState("Y");
  const [link, setLink] = useState("");
  const [protected_, setProtected_] = useState(false);
  const [showProtectionInfo, setShowProtectionInfo] = useState(false);

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [paths, setPaths] = useState([]);
  const [currentPath, setCurrentPath] = useState([]);
  const [brushColor, setBrushColor] = useState("#000000");
  const [brushSize, setBrushSize] = useState(5);
  const [drawingData, setDrawingData] = useState(null);

  // Placement / checkout
  const [isPlacing, setIsPlacing] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  // Protected-post overlap checking
  const [protectedPosts, setProtectedPosts] = useState([]);
  const [overlapError, setOverlapError] = useState(false);
  const [isShaking, setIsShaking] = useState(false);

  const [longPressProgress, setLongPressProgress] = useState(0);

  const longPressTimer = useRef(null);
  const longPressInterval = useRef(null);
  const longPressStart = useRef(null);
  const postItWrapperRef = useRef(null);
  const canvasRef = useRef(null);

  const { user, loading } = useAuth();
  const { screenToBoard, zoom, transformListenerRef, setIsBoardInteractive } =
    useBoard();
  const navigate = useNavigate();

  const totalPrice = SIZE_PRICES[size] + (protected_ ? PROTECTION_PRICE : 0);
  const canvasPx = SIZE_CONFIG[size].canvas;

  // ── Board interaction ────────────────────────────────────────────────────
  useEffect(() => {
    setIsBoardInteractive(false);
    return () => setIsBoardInteractive(true);
  }, [setIsBoardInteractive]);

  useEffect(() => {
    document.title = "Draw · makeapost";
  }, []);

  useEffect(() => {
    if (!isPlacing) {
      setIsBoardInteractive(false);
      transformListenerRef.current = null;
      return;
    }
    setIsBoardInteractive(true);
    if (postItWrapperRef.current) {
      postItWrapperRef.current.style.transform = `translate(-50%, -50%) scale(${zoom})`;
    }
    transformListenerRef.current = ({ zoom: z }) => {
      if (postItWrapperRef.current) {
        postItWrapperRef.current.style.transform = `translate(-50%, -50%) scale(${z})`;
      }
    };
    return () => {
      transformListenerRef.current = null;
    };
  }, [isPlacing]);

  // Fetch protected posts once so frontend can check overlap instantly
  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/stripe/protected-posts`, {
      credentials: "include",
    })
      .then((r) => r.json())
      .then((data) => setProtectedPosts(data.posts ?? []))
      .catch(() => {});
  }, []);

  // ── Long-press ───────────────────────────────────────────────────────────
  const cancelLongPress = useCallback(() => {
    clearTimeout(longPressTimer.current);
    clearInterval(longPressInterval.current);
    setLongPressProgress(0);
  }, []);

  const startLongPress = useCallback(() => {
    cancelLongPress();
    longPressStart.current = Date.now();
    longPressInterval.current = setInterval(() => {
      const elapsed = Date.now() - longPressStart.current;
      setLongPressProgress(Math.min(elapsed / LONG_PRESS_MS, 1));
    }, 16);
    longPressTimer.current = setTimeout(async () => {
      cancelLongPress();
      setLongPressProgress(1);
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const { x, y } = screenToBoard(cx, cy);
      await handlePost(x, y);
    }, LONG_PRESS_MS);
  }, [screenToBoard, cancelLongPress]);

  // ── Canvas drawing ───────────────────────────────────────────────────────
  const getCoords = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const startDrawing = (e) => {
    if (e.cancelable) e.preventDefault();
    setIsDrawing(true);
    setCurrentPath([getCoords(e)]);
  };
  const draw = (e) => {
    if (!isDrawing) return;
    if (e.cancelable) e.preventDefault();
    setCurrentPath((prev) => [...prev, getCoords(e)]);
  };
  const stopDrawing = () => {
    if (isDrawing && currentPath.length > 0) {
      setPaths((prev) => [
        ...prev,
        { points: currentPath, color: brushColor, size: brushSize },
      ]);
      setCurrentPath([]);
    }
    setIsDrawing(false);
  };

  // Extracted so it can be called both reactively and imperatively (on remount)
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    [
      ...paths,
      currentPath.length > 1
        ? { points: currentPath, color: brushColor, size: brushSize }
        : null,
    ]
      .filter(Boolean)
      .forEach((path) => {
        if (path.points.length < 2) return;
        ctx.strokeStyle = path.color;
        ctx.lineWidth = path.size;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(path.points[0].x, path.points[0].y);
        for (let i = 1; i < path.points.length; i++)
          ctx.lineTo(path.points[i].x, path.points[i].y);
        ctx.stroke();
      });
  }, [paths, currentPath, brushColor, brushSize]);

  // Redraw whenever drawing state changes
  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  // Repaint after returning to step 2 — the canvas remounts due to the animation
  // key change so its pixels are blank even though `paths` state is intact.
  useEffect(() => {
    if (step === 2) redrawCanvas();
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearCanvas = () => {
    setPaths([]);
    setCurrentPath([]);
  };
  const undo = () => setPaths((prev) => prev.slice(0, -1));

  const generateDrawingData = () => ({
    paths: paths.map((path) =>
      path.points.length < 3
        ? path
        : { ...path, points: simplify(path.points, 1.1, true) },
    ),
    width: canvasRef.current?.width || canvasPx,
    height: canvasRef.current?.height || canvasPx,
  });

  // ── Navigation ───────────────────────────────────────────────────────────
  function goToStep(n) {
    setStep(n);
    setStepKey((k) => k + 1);
  }

  function handleSizeChange(newSize) {
    const oldPx = SIZE_CONFIG[size].canvas;
    const newPx = SIZE_CONFIG[newSize].canvas;
    const ratio = newPx / oldPx;
    // Scale existing strokes proportionally so they still look right
    setPaths((prev) =>
      prev.map((path) => ({
        ...path,
        points: path.points.map((p) => ({ x: p.x * ratio, y: p.y * ratio })),
      })),
    );
    setSize(newSize);
  }

  function handleNextFromStep2() {
    if (paths.length === 0) {
      // Subtle: just return — the empty-state hint in the canvas area is enough
      return;
    }
    goToStep(3);
  }

  // ── Placement / checkout ─────────────────────────────────────────────────
  function cancelPlacement() {
    cancelLongPress();
    setIsPlacing(false);
    setOverlapError(false);
    setIsShaking(false);
  }

  async function handlePost(x, y) {
    // ── Frontend overlap check ───────────────────────────────────────────
    const blocked = protectedPosts.some((p) =>
      overlapsProtected(x, y, size, p),
    );
    if (blocked) {
      setOverlapError(true);
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 600);
      setTimeout(() => setOverlapError(false), 2000);
      cancelLongPress();
      return;
    }

    setOverlapError(false);
    setIsCheckingOut(true);

    const payload = {
      message: null,
      drawing: drawingData,
      link: link || null,
      size,
      position_x: x,
      position_y: y,
      color,
      expiration: "30 days",
      protected: protected_,
    };
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/stripe/create-checkout-session`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          credentials: "include",
        },
      );

      // ── Backend authoritative check ──────────────────────────────────
      if (res.status === 409) {
        const body = await res.json();
        if (body.code === "PROTECTED_OVERLAP") {
          setOverlapError(true);
          setIsShaking(true);
          setTimeout(() => setIsShaking(false), 600);
          setTimeout(() => setOverlapError(false), 2000);
          setIsCheckingOut(false);
          return;
        }
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { url } = await res.json();
      window.location.href = url;
    } catch (err) {
      console.error("Checkout error:", err);
      alert("Failed to start checkout");
      setIsCheckingOut(false);
      setIsPlacing(false);
    }
  }

  // ── Guards ───────────────────────────────────────────────────────────────
  if (loading) return <div className="p-8 text-center">Loading…</div>;
  if (!user) {
    navigate("/");
    return <div className="p-8 text-center">Redirecting…</div>;
  }

  const RING_R = 36;
  const RING_CIRC = 2 * Math.PI * RING_R;

  return (
    <>
      <style>{`
        @keyframes popIn {
          0%   { opacity: 0; transform: scale(0.82); }
          65%  { transform: scale(1.05); }
          82%  { transform: scale(0.97); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes breathe {
          0%, 100% { transform: scale(1);     }
          50%       { transform: scale(1.018); }
        }
        @keyframes march {
          from { stroke-dashoffset: 20; }
          to   { stroke-dashoffset: 0;  }
        }
        @keyframes crosshairFade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes panelSlideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(12px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0);    }
        }
        @keyframes stepIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
        .step-content { animation: stepIn 0.32s cubic-bezier(0.22, 1, 0.36, 1) forwards; }
        @keyframes shake {
          0%       { transform: translate(-50%,-50%) scale(var(--pz,1)) translateX(0); }
          10%, 90% { transform: translate(-50%,-50%) scale(var(--pz,1)) translateX(-8px) rotate(-1.5deg); }
          20%, 80% { transform: translate(-50%,-50%) scale(var(--pz,1)) translateX(8px)  rotate(1.5deg);  }
          30%, 70% { transform: translate(-50%,-50%) scale(var(--pz,1)) translateX(-6px) rotate(-1deg);   }
          40%, 60% { transform: translate(-50%,-50%) scale(var(--pz,1)) translateX(6px)  rotate(1deg);    }
          50%      { transform: translate(-50%,-50%) scale(var(--pz,1)) translateX(-3px); }
          100%     { transform: translate(-50%,-50%) scale(var(--pz,1)) translateX(0); }
        }
        @keyframes blockedPulse {
          0%, 100% { opacity: 0.55; }
          50%      { opacity: 0.9;  }
        }
      `}</style>

      <CheckoutRedirectModal isOpen={isCheckingOut} />

      {/* ═══════════════════════════════════════════════════════════════════
          PLACEMENT MODE
      ═══════════════════════════════════════════════════════════════════ */}
      {isPlacing && drawingData && (
        <div className="fixed inset-0 z-50 pointer-events-none">
          {/* Crosshair — turns red when placement is blocked */}
          <svg
            className="absolute inset-0 w-full h-full"
            style={{
              animation: "crosshairFade 0.5s ease forwards",
              opacity: 0,
            }}
          >
            <line
              x1="50%"
              y1="0"
              x2="50%"
              y2="100%"
              stroke={overlapError ? "#ef4444" : "black"}
              strokeWidth="1.5"
              strokeDasharray="10 6"
              opacity={overlapError ? "0.5" : "0.25"}
              style={{
                animation: "march 0.5s linear infinite",
                transition: "stroke 0.25s",
              }}
            />
            <line
              x1="0"
              y1="50%"
              x2="100%"
              y2="50%"
              stroke={overlapError ? "#ef4444" : "black"}
              strokeWidth="1.5"
              strokeDasharray="10 6"
              opacity={overlapError ? "0.5" : "0.25"}
              style={{
                animation: "march 0.5s linear infinite",
                transition: "stroke 0.25s",
              }}
            />
          </svg>

          <div
            className="absolute pointer-events-none"
            style={{
              left: "50%",
              top: "50%",
              transform: "translate(-50%,-50%)",
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "rgba(0,0,0,0.55)",
                boxShadow:
                  "0 0 0 2.5px rgba(255,255,255,0.9), 0 0 0 4.5px rgba(0,0,0,0.25)",
              }}
            />
          </div>

          <div
            ref={postItWrapperRef}
            className="absolute pointer-events-auto"
            style={{
              left: "50%",
              top: "50%",
              "--pz": zoom,
              transform: isShaking
                ? undefined
                : `translate(-50%, -50%) scale(${zoom})`,
              transformOrigin: "center center",
              touchAction: "none",
              userSelect: "none",
              WebkitUserSelect: "none",
              animation: isShaking
                ? "shake 0.55s cubic-bezier(0.36,0.07,0.19,0.97) forwards"
                : "none",
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              startLongPress();
            }}
            onMouseUp={(e) => {
              e.stopPropagation();
              cancelLongPress();
            }}
            onMouseLeave={cancelLongPress}
            onTouchStart={(e) => {
              e.stopPropagation();
              startLongPress();
            }}
            onTouchEnd={(e) => {
              e.stopPropagation();
              cancelLongPress();
            }}
            onTouchCancel={cancelLongPress}
          >
            <div
              style={{
                animation:
                  longPressProgress === 0
                    ? "popIn 0.45s cubic-bezier(0.22,1,0.36,1) forwards, breathe 2.5s ease-in-out 0.45s infinite"
                    : "popIn 0.45s cubic-bezier(0.22,1,0.36,1) forwards",
                transformOrigin: "center center",
                position: "relative",
              }}
            >
              <PostIt
                drawing={drawingData}
                link={null}
                size={size}
                color={color}
                isProtected={protected_}
                createdAt={new Date().toISOString()}
                expiresAt={new Date().toISOString()}
              />

              {/* Pulsing red overlay when blocked by a protected post */}
              {overlapError && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: 2,
                    background: "rgba(220,38,38,0.15)",
                    border: "2.5px solid rgba(220,38,38,0.85)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    animation: "blockedPulse 1s ease-in-out infinite",
                    pointerEvents: "none",
                  }}
                ></div>
              )}
            </div>

            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              style={{
                opacity: longPressProgress > 0 ? 1 : 0,
                transition: "opacity 0.12s",
              }}
            >
              <svg
                width={RING_R * 2 + 8}
                height={RING_R * 2 + 8}
                style={{ position: "absolute" }}
              >
                <circle
                  cx={RING_R + 4}
                  cy={RING_R + 4}
                  r={RING_R}
                  fill="none"
                  stroke="rgba(0,0,0,0.15)"
                  strokeWidth="5"
                />
                <circle
                  cx={RING_R + 4}
                  cy={RING_R + 4}
                  r={RING_R}
                  fill="none"
                  stroke="rgba(0,0,0,0.85)"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={RING_CIRC}
                  strokeDashoffset={RING_CIRC * (1 - longPressProgress)}
                  transform={`rotate(-90 ${RING_R + 4} ${RING_R + 4})`}
                  style={{ transition: "stroke-dashoffset 0.016s linear" }}
                />
              </svg>
            </div>
          </div>

          <div
            className="absolute top-30 left-1/2 pointer-events-auto flex flex-col items-center gap-3"
            style={{
              animation:
                "panelSlideUp 0.4s cubic-bezier(0.22,1,0.36,1) forwards",
              opacity: 0,
            }}
          >
            {/* Instruction pill — morphs to red when blocked */}
            <div
              className="text-white text-sm px-5 py-2.5 rounded-full shadow-lg backdrop-blur-sm text-center transition-colors duration-300"
              style={{
                background: overlapError
                  ? "rgba(220,38,38,0.88)"
                  : "rgba(0,0,0,0.70)",
                maxWidth: "min(90vw, 360px)",
              }}
            >
              {overlapError
                ? "🛡️ Protected post here — pan to a free spot"
                : longPressProgress > 0
                  ? "Keep holding…"
                  : "Pan & zoom the board · Hold post‑it to place"}
            </div>
            <button
              onClick={cancelPlacement}
              className="bg-white/90 backdrop-blur-sm text-slate-600 px-5 py-2.5 rounded-full shadow-lg text-sm font-medium hover:bg-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          3-STEP FORM
      ═══════════════════════════════════════════════════════════════════ */}
      {!isPlacing && (
        <div className="flex items-start justify-center px-4 py-10 sm:py-14">
          {/* Step 2 gets more width for the canvas; others stay narrow */}
          <div
            className={`w-full transition-all duration-300 ${step === 2 ? "max-w-lg" : "max-w-sm"}`}
          >
            <StepDots step={step} />

            <div key={stepKey} className="step-content">
              {/* ─── STEP 1 · Size & Color ─────────────────────────────── */}
              {step === 1 && (
                <div className="space-y-7">
                  <div className="text-center">
                    <h1 className="text-2xl font-bold text-slate-900">
                      Choose your post‑it
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">
                      Pick a size and colour
                    </p>
                  </div>

                  {/* Size cards */}
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-3">
                      Size
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                      {Object.entries(SIZE_CONFIG).map(([key, cfg]) => (
                        <button
                          key={key}
                          onClick={() => handleSizeChange(key)}
                          className={`flex flex-col items-center justify-end gap-2 p-3 pt-4 rounded-2xl border-2 transition-all duration-200 ${
                            size === key
                              ? "border-slate-900 bg-slate-900 text-white shadow-md scale-105"
                              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:shadow-sm"
                          }`}
                        >
                          <div className="flex items-end justify-center h-16">
                            <div
                              style={{
                                width: cfg.icon,
                                height: cfg.icon,
                                background: COLOR_CONFIG[color].bg,
                                boxShadow: "2px 2px 6px rgba(0,0,0,0.15)",
                                flexShrink: 0,
                              }}
                            />
                          </div>
                          <span className="text-xs font-semibold leading-none">
                            {cfg.label}
                          </span>
                          <span className="text-xs leading-none text-slate-400">
                            ${cfg.price}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Colour swatches */}
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-3">
                      Colour
                    </p>
                    <div className="flex gap-5">
                      {Object.entries(COLOR_CONFIG).map(([key, cfg]) => (
                        <button
                          key={key}
                          onClick={() => setColor(key)}
                          className="flex flex-col items-center gap-2 group"
                          title={cfg.label}
                        >
                          <div
                            className={`rounded-full transition-all duration-200 ${
                              color === key
                                ? "scale-110 ring-[3px] ring-offset-2 ring-slate-900"
                                : "group-hover:scale-105"
                            }`}
                            style={{
                              width: 44,
                              height: 44,
                              background: cfg.bg,
                              boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
                            }}
                          />
                          <span
                            className={`text-xs transition-colors ${
                              color === key
                                ? "text-slate-900 font-semibold"
                                : "text-slate-400"
                            }`}
                          >
                            {cfg.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => goToStep(2)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-900 text-white rounded-xl hover:bg-slate-800 active:bg-slate-700 transition-colors font-medium text-sm"
                  >
                    Next <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* ─── STEP 2 · Draw ─────────────────────────────────────── */}
              {step === 2 && (
                <div className="space-y-5">
                  <div className="text-center">
                    <h1 className="text-2xl font-bold text-slate-900">
                      Draw your post‑it
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">
                      Use your finger or mouse to draw
                    </p>
                  </div>

                  {/* Canvas */}
                  <div
                    className="rounded-xl overflow-hidden shadow-lg mx-auto"
                    style={{
                      background: COLOR_CONFIG[color].bg,
                      width: "100%",
                    }}
                  >
                    <canvas
                      ref={canvasRef}
                      width={canvasPx}
                      height={canvasPx}
                      onMouseDown={startDrawing}
                      onMouseMove={draw}
                      onMouseUp={stopDrawing}
                      onMouseLeave={stopDrawing}
                      onTouchStart={startDrawing}
                      onTouchMove={draw}
                      onTouchEnd={stopDrawing}
                      onTouchCancel={stopDrawing}
                      className="cursor-crosshair block touch-none"
                      style={{
                        width: "100%",
                        height: "auto",
                        display: "block",
                      }}
                    />
                  </div>

                  {/* Toolbar */}
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
                    {/* Colour palette */}
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-2">
                        Colour
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {PALETTE.map((c) => (
                          <button
                            key={c}
                            onClick={() => setBrushColor(c)}
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: "50%",
                              background: c,
                              boxShadow:
                                brushColor === c
                                  ? `0 0 0 2px white, 0 0 0 4px ${c === "#ffffff" ? "#94a3b8" : c}`
                                  : "0 1px 3px rgba(0,0,0,0.2)",
                              border:
                                c === "#ffffff" ? "1px solid #e2e8f0" : "none",
                              flexShrink: 0,
                              transition: "box-shadow 0.15s",
                            }}
                            aria-label={c}
                          />
                        ))}
                        {/* Custom colour picker */}
                        <label
                          title="Custom colour"
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: "50%",
                            background:
                              "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)",
                            cursor: "pointer",
                            flexShrink: 0,
                            overflow: "hidden",
                            position: "relative",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                          }}
                        >
                          <input
                            type="color"
                            value={brushColor}
                            onChange={(e) => setBrushColor(e.target.value)}
                            style={{
                              opacity: 0,
                              position: "absolute",
                              inset: 0,
                              width: "100%",
                              height: "100%",
                              cursor: "pointer",
                            }}
                          />
                        </label>
                      </div>
                    </div>

                    {/* Brush size */}
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-2">
                        Brush
                      </p>
                      <div className="flex gap-2">
                        {BRUSH_PRESETS.map((b) => (
                          <button
                            key={b.size}
                            onClick={() => setBrushSize(b.size)}
                            className={`flex-1 flex flex-col items-center gap-1.5 py-2 rounded-xl border-2 transition-all duration-150 ${
                              brushSize === b.size
                                ? "border-slate-900 bg-slate-900"
                                : "border-slate-200 bg-white hover:border-slate-300"
                            }`}
                          >
                            <div
                              style={{
                                width: b.size,
                                height: b.size,
                                borderRadius: "50%",
                                background:
                                  brushSize === b.size ? "#fff" : "#0f172a",
                                maxWidth: 20,
                                maxHeight: 20,
                                minWidth: 4,
                                minHeight: 4,
                              }}
                            />
                            <span
                              className={`text-[10px] font-medium leading-none ${
                                brushSize === b.size
                                  ? "text-white"
                                  : "text-slate-500"
                              }`}
                            >
                              {b.label}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Undo / Clear */}
                    <div className="flex gap-2">
                      <button
                        onClick={undo}
                        disabled={paths.length === 0}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-colors text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Undo2 className="w-3.5 h-3.5" /> Undo
                      </button>
                      <button
                        onClick={clearCanvas}
                        disabled={paths.length === 0}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-colors text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Clear
                      </button>
                    </div>
                  </div>

                  {/* Navigation */}
                  <div className="flex gap-3">
                    <button
                      onClick={() => goToStep(1)}
                      className="flex items-center gap-1.5 px-4 py-3 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors font-medium text-sm"
                    >
                      <ArrowLeft className="w-4 h-4" /> Back
                    </button>
                    <button
                      onClick={handleNextFromStep2}
                      disabled={paths.length === 0}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-slate-900 text-white rounded-xl hover:bg-slate-800 active:bg-slate-700 transition-colors font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Next <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Always reserve the hint's height so it never causes layout shift */}
                  <p
                    className="text-xs text-slate-400 text-center transition-opacity duration-200"
                    style={{
                      visibility: paths.length === 0 ? "visible" : "hidden",
                    }}
                  >
                    Draw something to continue
                  </p>
                </div>
              )}

              {/* ─── STEP 3 · Link / Protection / Place ───────────────── */}
              {step === 3 && (
                <div className="space-y-5">
                  <div className="text-center">
                    <h1 className="text-2xl font-bold text-slate-900">
                      Final details
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">Almost there!</p>
                  </div>

                  {/* Preview */}
                  <div className="flex justify-center">
                    <PostIt
                      drawing={generateDrawingData()}
                      link={link || null}
                      size={size}
                      color={color}
                      isProtected={protected_}
                      createdAt={new Date().toISOString()}
                      expiresAt={new Date().toISOString()}
                    />
                  </div>

                  {/* Link */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Link{" "}
                      <span className="font-normal text-slate-400">
                        (optional)
                      </span>
                    </label>
                    <input
                      type="url"
                      value={link}
                      onChange={(e) => setLink(e.target.value)}
                      placeholder="https://example.com"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 text-sm"
                    />
                    <p className="mt-1 text-xs text-slate-400">
                      Makes your post‑it clickable
                    </p>
                  </div>

                  {/* Protected toggle */}
                  <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <input
                      id="protected"
                      type="checkbox"
                      checked={protected_}
                      onChange={(e) => setProtected_(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 accent-slate-800 cursor-pointer"
                    />
                    <label
                      htmlFor="protected"
                      className="ml-2 text-sm font-medium text-slate-700 cursor-pointer select-none"
                    >
                      Protected{" "}
                      <span className="font-normal text-slate-400">(+$5)</span>
                    </label>
                    <div className="relative ml-2">
                      <button
                        type="button"
                        onMouseEnter={() => setShowProtectionInfo(true)}
                        onMouseLeave={() => setShowProtectionInfo(false)}
                        onClick={() => setShowProtectionInfo((v) => !v)}
                        className="flex items-center justify-center h-4 w-4 rounded-full bg-slate-300 hover:bg-slate-400 transition-colors"
                        aria-label="Protection info"
                      >
                        <Info className="h-3.5 w-3.5 text-white" />
                      </button>
                      {showProtectionInfo && (
                        <div className="absolute left-1/2 -translate-x-1/2 bottom-6 w-56 bg-slate-800 text-white text-xs rounded-lg px-3 py-2 shadow-lg z-10 pointer-events-none">
                          Protected posts cannot be covered by other posts
                          placed on top of them.
                          <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-slate-800" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Price + posting-as */}
                  <div className="flex items-center justify-between px-1">
                    <p className="text-xs text-slate-400">
                      Drawing as{" "}
                      {[user.given_name, user.family_name]
                        .filter(Boolean)
                        .join(" ") || "?"}
                    </p>
                    <p className="text-sm font-bold text-slate-900">
                      ${totalPrice}
                    </p>
                  </div>

                  {/* Navigation */}
                  <div className="flex gap-3">
                    <button
                      onClick={() => goToStep(2)}
                      className="flex items-center gap-1.5 px-4 py-3 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors font-medium text-sm"
                    >
                      <ArrowLeft className="w-4 h-4" /> Back
                    </button>
                    <button
                      onClick={() => {
                        setDrawingData(generateDrawingData());
                        setIsPlacing(true);
                      }}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-slate-900 text-white rounded-xl hover:bg-slate-800 active:bg-slate-700 transition-colors font-medium text-sm"
                    >
                      Place on Board — ${totalPrice}
                    </button>
                  </div>

                  <p className="text-xs text-slate-400 text-center">
                    Your post will be automatically removed after 30 days.
                  </p>
                </div>
              )}
            </div>
            {/* end step-content */}
          </div>
        </div>
      )}
    </>
  );
}

export default Draw;
