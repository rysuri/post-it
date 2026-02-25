import { useState, useEffect, useRef } from "react";
import { useAuth } from "../AuthContext";
import { useBoard } from "../BoardContext";
import { useNavigate } from "react-router-dom";
import PostIt from "../components/PostIt";
import CheckoutRedirectModal from "../components/CheckoutRedirectModal";
import { Info } from "lucide-react";
import simplify from "simplify-js";

const SIZE_PRICES = { S: 1, M: 3, L: 5 };
const PROTECTION_PRICE = 10;

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
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [boardPos, setBoardPos] = useState({ x: 0, y: 0 });
  const [drawingData, setDrawingData] = useState(null);

  const canvasRef = useRef(null);
  const { user, loading } = useAuth();
  const { screenToBoard, zoom, setIsBoardInteractive } = useBoard();
  const navigate = useNavigate();

  const totalPrice = SIZE_PRICES[size] + (protected_ ? PROTECTION_PRICE : 0);

  useEffect(() => {
    setIsBoardInteractive(false);
    return () => setIsBoardInteractive(true);
  }, [setIsBoardInteractive]);

  useEffect(() => {
    document.title = "Draw · makeapost";
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

  // ── Canvas helpers ────────────────────────────────────────────

  const getCanvasCoordinates = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDrawing = (e) => {
    const coords = getCanvasCoordinates(e);
    setIsDrawing(true);
    setCurrentPath([coords]);
  };

  const draw = (e) => {
    if (!isDrawing) return;
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
    setIsBoardInteractive(true);
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
      setIsBoardInteractive(false);
    }
  }

  if (loading) return <div className="p-8 text-center">Loading...</div>;
  if (!user) {
    navigate("/");
    return <div className="p-8 text-center">Redirecting to login...</div>;
  }

  const canvasPx = getCanvasSize();

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
      {isPlacing && drawingData && (
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
            drawing={drawingData}
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
        <div className="px-4 py-6 sm:px-6 max-w-5xl mx-auto">
          <div className="flex flex-col sm:flex-row gap-6 sm:gap-8 items-start">
            {/* Canvas + brush controls */}
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
                  className="cursor-crosshair block"
                  /* Scale canvas visually on mobile so it doesn't overflow */
                  style={{ maxWidth: "100%", height: "auto" }}
                />
              </div>

              {/* Brush controls */}
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

            {/* Form card */}
            <div className="flex-1 w-full bg-white shadow-lg rounded-lg p-5 sm:p-6 space-y-4">
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 text-center">
                Draw a Post-it
              </h1>

              <div className="space-y-4">
                {/* Size + Color */}
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

                    {/* Info icon */}
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
