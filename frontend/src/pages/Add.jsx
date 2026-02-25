import { useState, useEffect } from "react";
import axios from "axios";
import { useAuth } from "../AuthContext";
import { useBoard } from "../BoardContext";
import { useNavigate } from "react-router-dom";
import PostIt from "../components/PostIt";
import CheckoutRedirectModal from "../components/CheckoutRedirectModal";

function Add() {
  const [inputValue, setInputValue] = useState("");
  const [link, setLink] = useState("");
  const [size, setSize] = useState("S");
  const [color, setColor] = useState("Y");
  const [expiration, setExpiration] = useState("7 days");
  const [isPlacing, setIsPlacing] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [boardPos, setBoardPos] = useState({ x: 0, y: 0 });

  const { user, loading } = useAuth();
  const { screenToBoard, zoom, triggerRefresh, setIsBoardInteractive } =
    useBoard();
  const navigate = useNavigate();
  useEffect(() => {
    setIsBoardInteractive(false);
    return () => {
      setIsBoardInteractive(true);
    };
  }, [setIsBoardInteractive]);

  useEffect(() => {
    document.title = "Post-it · makeapost";
  }, []);
  useEffect(() => {
    if (!isPlacing) return;

    const handleMouseMove = (e) => {
      if (isCheckingOut) return;
      setMousePos({ x: e.clientX, y: e.clientY });
      const pos = screenToBoard(e.clientX, e.clientY);
      setBoardPos(pos);
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
    console.log("handle post");

    const payload = {
      message: inputValue,
      link: link || null,
      size: size,
      position_x: x,
      position_y: y,
      color: color,
      expiration: expiration,
    };
    console.log("payload:", payload);

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
      console.log("Redirecting to checkout:", url);
      window.location.href = url;
    } catch (error) {
      console.error("Checkout error:", error);
      alert("Failed to start checkout");
      setIsCheckingOut(false);
      setIsPlacing(false);
      setIsBoardInteractive(false);
    }
  }
  if (loading) {
    return <div className="p-8 text-center">Loading...</div>;
  }

  if (!user) {
    navigate("/");
    return <div className="p-8 text-center">Redirecting to login...</div>;
  }

  return (
    <>
      <style>{`
        @keyframes heartbeat {
          0%, 100% {
            opacity: 0.4;
          }
          50% {
            opacity: 0.7;
          }
        }
      `}</style>

      <CheckoutRedirectModal isOpen={isCheckingOut} />

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

      {!isPlacing && (
        <div className="p-6 max-w-3xl mx-auto">
          <div className="flex gap-8 items-start">
            <div className="flex-shrink-0">
              <PostIt
                message={inputValue}
                link={link || null}
                size="L"
                color={color}
                createdAt={new Date().toISOString()}
                expiresAt={new Date().toISOString()}
              />
            </div>

            <div className="flex-1 bg-white shadow-lg rounded-lg  p-6 space-y-4">
              <h1 className="text-3xl font-bold text-slate-900 mb-8 text-center">
                Make a Post
              </h1>

              <div className="space-y-4">
                <textarea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Enter text"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 resize-none"
                  rows={4}
                />

                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Size
                    </label>
                    <select
                      value={size}
                      onChange={(e) => setSize(e.target.value)}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 bg-white"
                    >
                      <option value="S">Small</option>
                      <option value="M">Medium</option>
                      <option value="L">Large</option>
                    </select>
                  </div>

                  <div className="flex-1">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Color
                    </label>
                    <select
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 bg-white"
                    >
                      <option value="Y">Yellow</option>
                      <option value="P">Pink</option>
                      <option value="B">Blue</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Link (optional)
                  </label>
                  <input
                    type="url"
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    placeholder="https://example.com"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Add a URL to make your post-it clickable
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Expiration
                  </label>
                  <select
                    value={expiration}
                    onChange={(e) => setExpiration(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 bg-white"
                  >
                    <option value="1 hour">1 hour</option>
                    <option value="7 days">7 days</option>
                    <option value="1 year">1 year</option>
                  </select>
                </div>

                <button
                  onClick={startPlacement}
                  className="w-full px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors font-medium"
                >
                  Place on Board
                </button>
              </div>

              <p className="mt-4 text-sm text-slate-600 text-center">
                Posting as: {user.name}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Add;
