import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../AuthContext";
import { useBoard } from "../BoardContext";
import { useNavigate } from "react-router-dom";
import PostIt from "../components/PostIt";
import CheckoutRedirectModal from "../components/CheckoutRedirectModal";
import { Info } from "lucide-react";
import simplify from "simplify-js";

const SIZE_PRICES = { S: 1, M: 3, L: 5 };
const PROTECTION_PRICE = 10;
const LONG_PRESS_MS = 600;

function Draw() {
  const [size, setSize] = useState("S");
  const [color, setColor] = useState("Y");
  const [link, setLink] = useState("");
  const [protected_, setProtected_] = useState(false);
  const [showProtectionInfo, setShowProtectionInfo] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [paths, setPaths] = useState([]);
  const [currentPath, setCurrentPath] = useState([]);
  const [brushColor, setBrushColor] = useState("#000000");
  const [brushSize, setBrushSize] = useState(3);
  const [isPlacing, setIsPlacing] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [drawingData, setDrawingData] = useState(null);

  const [longPressProgress, setLongPressProgress] = useState(0);
  const longPressTimer = useRef(null);
  const longPressInterval = useRef(null);
  const longPressStart = useRef(null);

  // Direct DOM ref for the post-it wrapper — we write transform here
  // synchronously from the board's applyTransform, zero lag
  const postItWrapperRef = useRef(null);

  const canvasRef = useRef(null);
  const { user, loading } = useAuth();
  const {
    screenToBoard,
    zoom,
    pan,
    transformListenerRef,
    setIsBoardInteractive,
  } = useBoard();
  const navigate = useNavigate();

  const totalPrice = SIZE_PRICES[size] + (protected_ ? PROTECTION_PRICE : 0);

  useEffect(() => {
    setIsBoardInteractive(false);
    return () => setIsBoardInteractive(true);
  }, [setIsBoardInteractive]);

  useEffect(() => {
    document.title = "Draw · makeapost";
  }, []);

  // While placing: board is interactive, and we hook into its applyTransform
  // to update the post-it's scale in the same call stack — zero lag
  useEffect(() => {
    if (!isPlacing) {
      setIsBoardInteractive(false);
      transformListenerRef.current = null;
      return;
    }

    setIsBoardInteractive(true);

    // Set initial transform from current board state
    if (postItWrapperRef.current) {
      postItWrapperRef.current.style.transform = `translate(-50%, -50%) scale(${zoom})`;
    }

    // Register listener — called synchronously inside Board's applyTransform
    // every wheel tick and every pointer move, same frame as board DOM update
    transformListenerRef.current = ({ zoom: z }) => {
      if (postItWrapperRef.current) {
        postItWrapperRef.current.style.transform = `translate(-50%, -50%) scale(${z})`;
      }
    };

    return () => {
      transformListenerRef.current = null;
    };
  }, [isPlacing]);

  // ── Long-press ──────────────────────────────────────────────

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
      const boardCoords = screenToBoard(cx, cy);
      await handlePost(boardCoords.x, boardCoords.y);
    }, LONG_PRESS_MS);
  }, [screenToBoard, cancelLongPress]);

  // ── Canvas helpers ──────────────────────────────────────────

  const getCanvasCoordinates = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (e) => {
    if (e.cancelable) e.preventDefault();
    setIsDrawing(true);
    setCurrentPath([getCanvasCoordinates(e)]);
  };
  const draw = (e) => {
    if (!isDrawing) return;
    if (e.cancelable) e.preventDefault();
    setCurrentPath((prev) => [...prev, getCanvasCoordinates(e)]);
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

  useEffect(() => {
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
    width: canvasRef.current?.width || 400,
    height: canvasRef.current?.height || 400,
  });

  const getCanvasSize = () => ({ S: 400, M: 500, L: 600 })[size] ?? 400;
  const getPostItColor = () =>
    ({ Y: "#fef08a", P: "#fbcfe8", B: "#bfdbfe" })[color] ?? "#fef08a";

  function startPlacement(e) {
    if (paths.length === 0) {
      alert("Please draw something first!");
      return;
    }
    e.stopPropagation();
    setDrawingData(generateDrawingData());
    setIsPlacing(true);
  }

  function cancelPlacement() {
    cancelLongPress();
    setIsPlacing(false);
  }

  async function handlePost(x, y) {
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
    setIsCheckingOut(true);
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
      const { url } = await res.json();
      window.location.href = url;
    } catch (error) {
      console.error("Checkout error:", error);
      alert("Failed to start checkout");
      setIsCheckingOut(false);
      setIsPlacing(false);
    }
  }

  if (loading) return <div className="p-8 text-center">Loading...</div>;
  if (!user) {
    navigate("/");
    return <div className="p-8 text-center">Redirecting...</div>;
  }

  const canvasPx = getCanvasSize();
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
        @keyframes march {
          from { stroke-dashoffset: 20; }
          to   { stroke-dashoffset: 0; }
        }
        @keyframes crosshairFade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes panelSlideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(12px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes breathe {
          0%, 100% { transform: scale(1); }
          50%       { transform: scale(1.018); }
        }
      `}</style>

      <CheckoutRedirectModal isOpen={isCheckingOut} />

      {/* ── Placement mode ── */}
      {isPlacing && drawingData && (
        <div className="fixed inset-0 z-50 pointer-events-none">
          {/* Marching-ant crosshair */}
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
              stroke="black"
              strokeWidth="1.5"
              strokeDasharray="10 6"
              opacity="0.25"
              style={{ animation: "march 0.5s linear infinite" }}
            />
            <line
              x1="0"
              y1="50%"
              x2="100%"
              y2="50%"
              stroke="black"
              strokeWidth="1.5"
              strokeDasharray="10 6"
              opacity="0.25"
              style={{ animation: "march 0.5s linear infinite" }}
            />
          </svg>

          {/* Center dot */}
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

          {/*
            Post-it preview — centered on screen.
            transform is set here initially then overwritten directly by the
            transformListenerRef callback — same call stack as Board's DOM
            update, so scale is always perfectly in sync with the board.
          */}
          {/* Outer: owns transform (mutated directly by transformListenerRef — no animation here
               or CSS animation forwards-fill would override the inline style writes) */}
          <div
            ref={postItWrapperRef}
            className="absolute pointer-events-auto"
            style={{
              left: "50%",
              top: "50%",
              transform: `translate(-50%, -50%) scale(${zoom})`,
              transformOrigin: "center center",
              touchAction: "none",
              userSelect: "none",
              WebkitUserSelect: "none",
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
            {/* Inner: owns animations — isolated so forwards-fill never touches the outer transform */}
            <div
              style={{
                animation:
                  longPressProgress === 0
                    ? "popIn 0.45s cubic-bezier(0.22,1,0.36,1) forwards, breathe 2.5s ease-in-out 0.45s infinite"
                    : "popIn 0.45s cubic-bezier(0.22,1,0.36,1) forwards",
                transformOrigin: "center center",
                borderRadius: 4,
              }}
            >
              <PostIt
                drawing={drawingData}
                link={null}
                size={size}
                color={color}
                createdAt={new Date().toISOString()}
                expiresAt={new Date().toISOString()}
              />
            </div>

            {/* Long-press progress ring */}
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

          {/* Bottom panel */}
          <div
            className="absolute top-30 left-1/2 pointer-events-auto flex flex-col items-center gap-3"
            style={{
              animation:
                "panelSlideUp 0.4s cubic-bezier(0.22,1,0.36,1) forwards",
              opacity: 0,
            }}
          >
            <div className="bg-black/70 backdrop-blur-sm text-white text-sm px-5 py-2.5 rounded-full shadow-lg whitespace-nowrap">
              {longPressProgress > 0
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

      {/* ── Draw form ── */}
      {!isPlacing && (
        <div className="px-4 py-6 sm:px-6 max-w-5xl mx-auto">
          <div className="flex flex-col sm:flex-row gap-6 sm:gap-8 items-start">
            <div className="flex-shrink-0 w-full sm:w-auto flex flex-col items-center">
              <div
                className="rounded-lg shadow-lg overflow-hidden"
                style={{ backgroundColor: getPostItColor() }}
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
                  style={{ maxWidth: "100%", height: "auto" }}
                />
              </div>
              <div className="mt-4 w-full space-y-3">
                <div className="flex gap-2">
                  <button
                    onClick={undo}
                    disabled={paths.length === 0}
                    className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Undo
                  </button>
                  <button
                    onClick={clearCanvas}
                    disabled={paths.length === 0}
                    className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Clear
                  </button>
                </div>
                <div className="flex gap-4 items-center">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Brush Color
                    </label>
                    <input
                      type="color"
                      value={brushColor}
                      onChange={(e) => setBrushColor(e.target.value)}
                      className="w-full h-10 rounded-lg cursor-pointer"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Brush Size: {brushSize}px
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="20"
                      value={brushSize}
                      onChange={(e) => setBrushSize(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 w-full bg-white shadow-lg rounded-lg p-5 sm:p-6 space-y-4">
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 text-center">
                Draw a Post-it
              </h1>
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Size
                    </label>
                    <select
                      value={size}
                      onChange={(e) => {
                        const newSize = e.target.value;
                        const oldPx = getCanvasSize();
                        const newPx =
                          { S: 400, M: 500, L: 600 }[newSize] ?? 400;
                        const ratio = newPx / oldPx;
                        setPaths((prev) =>
                          prev.map((path) => ({
                            ...path,
                            points: path.points.map((p) => ({
                              x: p.x * ratio,
                              y: p.y * ratio,
                            })),
                          })),
                        );
                        setSize(newSize);
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 bg-white text-sm"
                    >
                      <option value="S">Small ($1)</option>
                      <option value="M">Medium ($3)</option>
                      <option value="L">Large ($5)</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Color
                    </label>
                    <select
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 bg-white text-sm"
                    >
                      <option value="Y">Yellow</option>
                      <option value="P">Pink</option>
                      <option value="B">Blue</option>
                    </select>
                  </div>
                </div>

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
                    Makes your post-it clickable
                  </p>
                </div>

                <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <input
                      id="protected"
                      type="checkbox"
                      checked={protected_}
                      onChange={(e) => setProtected_(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 accent-slate-800 cursor-pointer"
                    />
                    <label
                      htmlFor="protected"
                      className="text-sm font-medium text-slate-700 cursor-pointer select-none"
                    >
                      Protected{" "}
                      <span className="font-normal text-slate-400">(+$5)</span>
                    </label>
                    <div className="relative">
                      <button
                        type="button"
                        onMouseEnter={() => setShowProtectionInfo(true)}
                        onMouseLeave={() => setShowProtectionInfo(false)}
                        onClick={() => setShowProtectionInfo((v) => !v)}
                        className="text-slate-400 hover:text-slate-600 transition-colors"
                        aria-label="Protection info"
                      >
                        <Info className="h-4 w-4" />
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
                </div>

                <button
                  onClick={startPlacement}
                  className="w-full px-4 py-3 bg-slate-900 text-white rounded-lg hover:bg-slate-800 active:bg-slate-700 transition-colors font-medium text-sm"
                >
                  Place on Board — ${totalPrice}
                </button>
                <p className="text-xs text-slate-400 text-center">
                  Your post will be automatically removed from the board after
                  30 days.
                </p>
              </div>
              <p className="text-xs text-slate-400 text-center pt-1">
                Drawing as:{" "}
                {[user.given_name, user.family_name]
                  .filter(Boolean)
                  .join(" ") || "?"}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Draw;
