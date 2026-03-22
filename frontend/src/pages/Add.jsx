import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../AuthContext";
import { useBoard } from "../BoardContext";
import { useNavigate } from "react-router-dom";
import PostIt from "../components/PostIt";
import CheckoutRedirectModal from "../components/CheckoutRedirectModal";
import { Info, ArrowLeft, ArrowRight } from "lucide-react";

const SIZE_PRICES = { S: 1, M: 3, L: 5 };
const PROTECTION_PRICE = 10;
const LONG_PRESS_MS = 600;

// ⚠️  IMPORTANT: bg colours, font-family, font-size, line-height and padding
//     in the editable post-it (Step 2) must match your PostIt component exactly
//     so the preview in Step 3 and the live board look identical.
const COLOR_CONFIG = {
  Y: { bg: "#FEF08A", label: "Yellow" },
  P: { bg: "#FBCFE8", label: "Pink" },
  B: { bg: "#BAE6FD", label: "Blue" },
};

const SIZE_CONFIG = {
  S: { px: 120, icon: 28, label: "Small", price: 1 },
  M: { px: 160, icon: 42, label: "Medium", price: 3 },
  L: { px: 220, icon: 58, label: "Large", price: 5 },
};

// Font / padding inside the post-it — keep in sync with PostIt component
const POSTIT_FONT = { S: 11, M: 13, L: 15 };
const POSTIT_PAD = { S: 10, M: 12, L: 16 };

// How much to scale up the editable post-it for comfortable typing
const EDIT_SCALE = { S: 2.2, M: 1.7, L: 1.25 };

// Board-space half-sizes — must match PostIt's Tailwind classes exactly:
//   S → w-32 = 128px → half = 64
//   M → w-48 = 192px → half = 96
//   L → w-64 = 256px → half = 128
const HALF_SIZE = { S: 64, M: 96, L: 128 };

// Returns true if a new post at (x,y,size) overlaps a protected post p.
function overlapsProtected(x, y, size, p) {
  return (
    Math.abs(x - p.position_x) < HALF_SIZE[size] + HALF_SIZE[p.size] &&
    Math.abs(y - p.position_y) < HALF_SIZE[size] + HALF_SIZE[p.size]
  );
}

// ─── Step dots ─────────────────────────────────────────────────────────────
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
function Add() {
  const [step, setStep] = useState(1);
  const [stepKey, setStepKey] = useState(0); // forces re-mount animation

  const [inputValue, setInputValue] = useState("");
  const [link, setLink] = useState("");
  const [size, setSize] = useState("S");
  const [color, setColor] = useState("Y");
  const [protected_, setProtected_] = useState(false);
  const [showProtectionInfo, setShowProtectionInfo] = useState(false);
  const [isPlacing, setIsPlacing] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  const [isFull, setIsFull] = useState(false); // true when post-it has no more room

  // Protected-post overlap checking
  const [protectedPosts, setProtectedPosts] = useState([]); // fetched once on mount
  const [overlapError, setOverlapError] = useState(false); // true when placement is blocked
  const [isShaking, setIsShaking] = useState(false); // drives shake animation

  const [longPressProgress, setLongPressProgress] = useState(0);
  const longPressTimer = useRef(null);
  const longPressInterval = useRef(null);
  const longPressStart = useRef(null);
  const postItWrapperRef = useRef(null);
  const textareaRef = useRef(null);
  const mirrorRef = useRef(null); // hidden div used for overflow measurement

  // Returns true if `text` would visually overflow the post-it at the current size.
  // Uses a hidden mirror div with identical font/dimensions so spaces & newlines
  // count spatially — perfect for ASCII art.
  const wouldOverflow = useCallback((text) => {
    const el = mirrorRef.current;
    if (!el) return false;
    el.textContent = text;
    return el.scrollHeight > el.offsetHeight;
  }, []);

  const { user, loading } = useAuth();
  const { screenToBoard, zoom, transformListenerRef, setIsBoardInteractive } =
    useBoard();
  const navigate = useNavigate();

  const totalPrice = SIZE_PRICES[size] + (protected_ ? PROTECTION_PRICE : 0);

  // Editable post-it geometry
  const pxSize = SIZE_CONFIG[size].px;
  const editScale = EDIT_SCALE[size];
  const extraMargin = (pxSize * editScale - pxSize) / 2; // layout compensation for CSS transform

  // ── Board interaction ────────────────────────────────────────────────────
  useEffect(() => {
    setIsBoardInteractive(false);
    return () => setIsBoardInteractive(true);
  }, [setIsBoardInteractive]);

  useEffect(() => {
    document.title = "Post-it · makeapost";
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

  // Fetch protected posts once so the frontend can check overlap instantly
  // without a round-trip on every placement attempt.
  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/stripe/protected-posts`, {
      credentials: "include",
    })
      .then((r) => r.json())
      .then((data) => setProtectedPosts(data.posts ?? []))
      .catch(() => {}); // silent — backend is the authoritative check anyway
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

  // ── Navigation ───────────────────────────────────────────────────────────
  function goToStep(n) {
    setStep(n);
    setStepKey((k) => k + 1);
  }

  function handleNextFromStep2() {
    if (!inputValue.trim()) {
      // Shake the post-it slightly as feedback — handled via CSS class toggle
      textareaRef.current?.focus();
      return;
    }
    goToStep(3);
  }

  // When size changes, keep text but re-check overflow on next render
  function handleSizeChange(newSize) {
    setSize(newSize);
    // isFull will be re-evaluated naturally once the mirror resizes
    setIsFull(false);
  }

  // ── Placement / checkout ─────────────────────────────────────────────────
  function cancelPlacement() {
    cancelLongPress();
    setIsPlacing(false);
    setOverlapError(false);
    setIsShaking(false);
  }

  async function handlePost(x, y) {
    // ── Frontend overlap check (instant, no round-trip) ──────────────────
    const blocked = protectedPosts.some((p) =>
      overlapsProtected(x, y, size, p),
    );
    if (blocked) {
      setOverlapError(true);
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 600);
      setTimeout(() => setOverlapError(false), 2000);
      cancelLongPress();
      return; // stay on placement screen — error banner shown below
    }

    setOverlapError(false);
    setIsCheckingOut(true);

    const payload = {
      message: inputValue,
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

      // ── Backend overlap check (authoritative) ────────────────────────
      if (res.status === 409) {
        const body = await res.json();
        if (body.code === "PROTECTED_OVERLAP") {
          setOverlapError(true);
          setIsShaking(true);
          setTimeout(() => setIsShaking(false), 600);
          setTimeout(() => setOverlapError(false), 2000);
          setIsCheckingOut(false);
          return; // stay on placement screen
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
        @import url('https://fonts.googleapis.com/css2?family=Caveat:wght@400;600&display=swap');

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
        .step-content {
          animation: stepIn 0.32s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        .postit-textarea::placeholder {
          color: rgba(0, 0, 0, 0.3);
        }
        @keyframes shake {
          0%        { transform: translate(-50%,-50%) scale(var(--pz,1)) translateX(0); }
          10%, 90%  { transform: translate(-50%,-50%) scale(var(--pz,1)) translateX(-8px) rotate(-1.5deg); }
          20%, 80%  { transform: translate(-50%,-50%) scale(var(--pz,1)) translateX(8px)  rotate(1.5deg);  }
          30%, 70%  { transform: translate(-50%,-50%) scale(var(--pz,1)) translateX(-6px) rotate(-1deg);   }
          40%, 60%  { transform: translate(-50%,-50%) scale(var(--pz,1)) translateX(6px)  rotate(1deg);    }
          50%       { transform: translate(-50%,-50%) scale(var(--pz,1)) translateX(-3px); }
          100%      { transform: translate(-50%,-50%) scale(var(--pz,1)) translateX(0); }
        }
        @keyframes blockedPulse {
          0%, 100% { opacity: 0.55; }
          50%      { opacity: 0.9;  }
        }
      `}</style>

      <CheckoutRedirectModal isOpen={isCheckingOut} />

      {/* ═══════════════════════════════════════════════════════════════════
          PLACEMENT MODE  (unchanged from original)
      ═══════════════════════════════════════════════════════════════════ */}
      {isPlacing && (
        <div className="fixed inset-0 z-50 pointer-events-none">
          {/* Marching-ant crosshair — turns red when placement is blocked */}
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
              strokeWidth="1"
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

          {/* Centre dot */}
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

          {/* Post-it ghost */}
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
                message={inputValue}
                link={link || null}
                size={size}
                color={color}
                isProtected={protected_}
                createdAt={new Date().toISOString()}
                expiresAt={new Date().toISOString()}
              />

              {/* Pulsing red overlay when placement is blocked by a protected post */}
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
            {/* Instruction pill — morphs to red error state when blocked */}
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
          <div className="w-full max-w-sm">
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
                          {/* Visual size square tinted in selected colour */}
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
                          <span
                            className={`text-xs leading-none ${size === key ? "text-slate-400" : "text-slate-400"}`}
                          >
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

              {/* ─── STEP 2 · Write on the post-it ────────────────────── */}
              {step === 2 && (
                <div className="space-y-7">
                  <div className="text-center">
                    <h1 className="text-2xl font-bold text-slate-900">
                      Write your message
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">
                      Type directly on the post‑it
                    </p>
                  </div>

                  {/* Editable post-it — scaled up for comfortable typing */}
                  <div
                    className="flex flex-col items-center"
                    style={{ minHeight: pxSize * editScale + 16 }}
                  >
                    <div
                      style={{
                        transform: `scale(${editScale})`,
                        transformOrigin: "center center",
                        marginTop: extraMargin,
                        marginBottom: extraMargin,
                      }}
                    >
                      <div
                        style={{
                          width: pxSize,
                          height: pxSize,
                          background: COLOR_CONFIG[color].bg,
                          boxShadow:
                            "3px 4px 14px rgba(0,0,0,0.18), 6px 8px 28px rgba(0,0,0,0.07)",
                          position: "relative",
                          cursor: "text",
                          // Subtle red outline flash when full
                          outline: isFull
                            ? "2px solid rgba(200,30,30,0.45)"
                            : "2px solid transparent",
                          transition: "outline-color 0.25s",
                        }}
                        onClick={() => textareaRef.current?.focus()}
                      >
                        {/*
                          Hidden mirror div — same font, padding, width, line-height as the textarea.
                          We write proposed text into it and check scrollHeight > offsetHeight.
                          white-space: pre-wrap preserves spaces/newlines so ASCII art is measured correctly.
                        */}
                        <div
                          ref={mirrorRef}
                          aria-hidden="true"
                          style={{
                            position: "absolute",
                            visibility: "hidden",
                            pointerEvents: "none",
                            top: 0,
                            left: 0,
                            width: pxSize - POSTIT_PAD[size] * 2,
                            // Reserve a few px at the bottom so text doesn't sit flush against edge
                            height: pxSize - POSTIT_PAD[size] * 2 - 4,
                            padding: 0,
                            fontFamily: "'Caveat', cursive",
                            fontSize: `${POSTIT_FONT[size]}px`,
                            lineHeight: 1.4,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            overflowY: "hidden",
                            boxSizing: "border-box",
                          }}
                        />

                        <textarea
                          ref={textareaRef}
                          className="postit-textarea"
                          value={inputValue}
                          onChange={(e) => {
                            const next = e.target.value;
                            if (wouldOverflow(next)) {
                              // Reject — flash the border briefly
                              setIsFull(true);
                              setTimeout(() => setIsFull(false), 600);
                            } else {
                              setInputValue(next);
                              setIsFull(false);
                            }
                          }}
                          placeholder="Write here…"
                          autoFocus
                          style={{
                            position: "absolute",
                            inset: 0,
                            width: "100%",
                            height: "100%",
                            background: "transparent",
                            border: "none",
                            outline: "none",
                            resize: "none",
                            overflow: "hidden",
                            padding: `${POSTIT_PAD[size]}px`,
                            // ⚠️ Keep these in sync with your PostIt component
                            fontFamily: "'Caveat', cursive",
                            fontSize: `${POSTIT_FONT[size]}px`,
                            lineHeight: 1.4,
                            color: "rgba(0,0,0,0.8)",
                            boxSizing: "border-box",
                            whiteSpace: "pre-wrap",
                          }}
                        />

                        {/* "Full" indicator — fades in when no room left */}
                        <div
                          style={{
                            position: "absolute",
                            bottom: 4,
                            right: 5,
                            fontSize: 8,
                            fontFamily: "system-ui, sans-serif",
                            color: "rgba(180,30,30,0.7)",
                            pointerEvents: "none",
                            opacity: isFull ? 1 : 0,
                            transition: "opacity 0.2s",
                          }}
                        >
                          full
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => goToStep(1)}
                      className="flex items-center gap-1.5 px-4 py-3 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors font-medium text-sm"
                    >
                      <ArrowLeft className="w-4 h-4" /> Back
                    </button>
                    <button
                      onClick={handleNextFromStep2}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-slate-900 text-white rounded-xl hover:bg-slate-800 active:bg-slate-700 transition-colors font-medium text-sm"
                    >
                      Next <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
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

                  {/* Live preview of the final post-it */}
                  <div className="flex justify-center">
                    <PostIt
                      message={inputValue}
                      link={link || null}
                      size={size}
                      color={color}
                      isProtected={protected_}
                      createdAt={new Date().toISOString()}
                      expiresAt={new Date().toISOString()}
                    />
                  </div>

                  {/* Link input */}
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
                      <span className="font-normal text-slate-400">(+$10)</span>
                    </label>

                    {/* Info tooltip */}
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
                      Posting as{" "}
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
                      onClick={() => setIsPlacing(true)}
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

export default Add;
