import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../AuthContext";
import { useBoard } from "../BoardContext";
import { useNavigate } from "react-router-dom";
import PostIt from "../components/PostIt";
import CheckoutRedirectModal from "../components/CheckoutRedirectModal";
import { Info } from "lucide-react";

const SIZE_PRICES = { S: 1, M: 3, L: 5 };
const PROTECTION_PRICE = 10;
const LONG_PRESS_MS = 600;

function Add() {
  const [inputValue, setInputValue] = useState("");
  const [link, setLink] = useState("");
  const [size, setSize] = useState("S");
  const [color, setColor] = useState("Y");
  const [protected_, setProtected_] = useState(false);
  const [showProtectionInfo, setShowProtectionInfo] = useState(false);
  const [isPlacing, setIsPlacing] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  const [longPressProgress, setLongPressProgress] = useState(0);
  const longPressTimer = useRef(null);
  const longPressInterval = useRef(null);
  const longPressStart = useRef(null);

  // Outer wrapper — transform mutated directly by transformListenerRef
  const postItWrapperRef = useRef(null);

  const { user, loading } = useAuth();
  const { screenToBoard, zoom, transformListenerRef, setIsBoardInteractive } =
    useBoard();
  const navigate = useNavigate();

  const totalPrice = SIZE_PRICES[size] + (protected_ ? PROTECTION_PRICE : 0);

  useEffect(() => {
    setIsBoardInteractive(false);
    return () => setIsBoardInteractive(true);
  }, [setIsBoardInteractive]);

  useEffect(() => {
    document.title = "Post-it · makeapost";
  }, []);

  // While placing: enable board interaction and register the live transform listener
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

  function startPlacement(e) {
    if (!inputValue.trim()) {
      alert("Please enter some text");
      return;
    }
    e.stopPropagation();
    setIsPlacing(true);
  }

  function cancelPlacement() {
    cancelLongPress();
    setIsPlacing(false);
  }

  async function handlePost(x, y) {
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
    return <div className="p-8 text-center">Redirecting to login...</div>;
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
          0%, 100% { transform: scale(1); }
          50%       { transform: scale(1.018); }
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
      `}</style>

      <CheckoutRedirectModal isOpen={isCheckingOut} />

      {/* ── Placement mode ── */}
      {isPlacing && (
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

          {/* Outer: owns transform — no animation so inline style writes are never overridden */}
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
            <div
              style={{
                animation:
                  longPressProgress === 0
                    ? "popIn 0.45s cubic-bezier(0.22,1,0.36,1) forwards, breathe 2.5s ease-in-out 0.45s infinite"
                    : "popIn 0.45s cubic-bezier(0.22,1,0.36,1) forwards",
                transformOrigin: "center center",
              }}
            >
              <PostIt
                message={inputValue}
                link={link || null}
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

      {/* ── Form ── */}
      {!isPlacing && (
        <div className="px-4 py-6 sm:px-6 max-w-3xl mx-auto">
          <div className="flex flex-col sm:flex-row gap-6 sm:gap-8 items-start">
            {/* Preview */}
            <div className="flex-shrink-0 flex justify-center w-full sm:w-auto">
              <PostIt
                message={inputValue}
                link={link || null}
                size="L"
                color={color}
                createdAt={new Date().toISOString()}
                expiresAt={new Date().toISOString()}
              />
            </div>

            {/* Form card */}
            <div className="flex-1 w-full bg-white shadow-lg rounded-lg p-5 sm:p-6 space-y-4">
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 text-center">
                Make a Post
              </h1>

              <div className="space-y-4">
                <textarea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Enter text"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 resize-none text-sm"
                  rows={4}
                />

                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Size
                    </label>
                    <select
                      value={size}
                      onChange={(e) => setSize(e.target.value)}
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

                <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
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
                        className="flex items-center justify-center h-4 w-4 rounded-full bg-slate-300 hover:bg-slate-400 transition-colors text-white text-xs font-bold leading-none"
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
                Posting as:{" "}
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

export default Add;
