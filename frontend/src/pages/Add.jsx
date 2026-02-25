import { useState, useEffect } from "react";
import { useAuth } from "../AuthContext";
import { useBoard } from "../BoardContext";
import { useNavigate } from "react-router-dom";
import PostIt from "../components/PostIt";
import CheckoutRedirectModal from "../components/CheckoutRedirectModal";
import { Info } from "lucide-react";
const SIZE_PRICES = { S: 1, M: 3, L: 5 };
const PROTECTION_PRICE = 10;

function Add() {
  const [inputValue, setInputValue] = useState("");
  const [link, setLink] = useState("");
  const [size, setSize] = useState("S");
  const [color, setColor] = useState("Y");
  const [protected_, setProtected_] = useState(false);
  const [showProtectionInfo, setShowProtectionInfo] = useState(false);
  const [isPlacing, setIsPlacing] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [boardPos, setBoardPos] = useState({ x: 0, y: 0 });

  const { user, loading } = useAuth();
  const { screenToBoard, zoom, setIsBoardInteractive } = useBoard();
  const navigate = useNavigate();

  const totalPrice = SIZE_PRICES[size] + (protected_ ? PROTECTION_PRICE : 0);

  useEffect(() => {
    setIsBoardInteractive(false);
    return () => setIsBoardInteractive(true);
  }, [setIsBoardInteractive]);

  useEffect(() => {
    document.title = "Post-it · makeapost";
  }, []);

  useEffect(() => {
    if (!isPlacing) return;
    const handleMouseMove = (e) => {
      if (isCheckingOut) return;
      setMousePos({ x: e.clientX, y: e.clientY });
      setBoardPos(screenToBoard(e.clientX, e.clientY));
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [isPlacing, isCheckingOut, screenToBoard]);

  useEffect(() => {
    if (!isPlacing) return;
    const timer = setTimeout(() => {
      const handleClick = async (e) => {
        e.preventDefault();
        await handlePost(boardPos.x, boardPos.y);
      };
      const handleEscape = (e) => {
        if (e.key === "Escape") {
          setIsPlacing(false);
          setIsBoardInteractive(false);
        }
      };
      window.addEventListener("click", handleClick);
      window.addEventListener("keydown", handleEscape);
      window._placementCleanup = () => {
        window.removeEventListener("click", handleClick);
        window.removeEventListener("keydown", handleEscape);
      };
    }, 0);
    return () => {
      clearTimeout(timer);
      if (window._placementCleanup) {
        window._placementCleanup();
        delete window._placementCleanup;
      }
    };
  }, [isPlacing, boardPos]);

  function startPlacement(e) {
    if (!inputValue.trim()) {
      alert("Please enter some text");
      return;
    }
    e.stopPropagation();
    setIsPlacing(true);
    setIsBoardInteractive(true);
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
      setIsBoardInteractive(false);
    }
  }

  if (loading) return <div className="p-8 text-center">Loading...</div>;

  if (!user) {
    navigate("/");
    return <div className="p-8 text-center">Redirecting to login...</div>;
  }

  return (
    <>
      <style>{`
        @keyframes heartbeat {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.7; }
        }
      `}</style>

      <CheckoutRedirectModal isOpen={isCheckingOut} />

      {/* ── Placement mode ── */}
      {isPlacing && (
        <div
          className="fixed pointer-events-none z-50"
          style={{
            left: `${mousePos.x}px`,
            top: `${mousePos.y}px`,
            transform: `translate(-50%, -50%) scale(${zoom})`,
            animation: "heartbeat 1.5s ease-in-out infinite",
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
          <div
            className="absolute left-1/2 -translate-x-1/2 bg-black text-white px-3 py-1 rounded text-sm whitespace-nowrap"
            style={{
              bottom: `${-32 / zoom}px`,
              transform: `translateX(-50%) scale(${1 / zoom})`,
              transformOrigin: "top center",
            }}
          >
            Click to place • ESC to cancel
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
                {/* Message */}
                <textarea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Enter text"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 resize-none text-sm"
                  rows={4}
                />

                {/* Size + Color */}
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
                    Makes your post-it clickable
                  </p>
                </div>

                {/* Protection */}
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

                    {/* Info icon */}
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

                {/* CTA */}
                <button
                  onClick={startPlacement}
                  className="w-full px-4 py-3 bg-slate-900 text-white rounded-lg hover:bg-slate-800 active:bg-slate-700 transition-colors font-medium text-sm"
                >
                  Place on Board — ${totalPrice}
                </button>

                {/* Disclaimer */}
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
