import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import axios from "axios";
import PostIt from "./PostIt";
import { useBoard } from "../BoardContext";
import { ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

function Board() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const location = useLocation();
  const boardRef = useRef(null);
  const boardInnerRef = useRef(null);

  // ── Refs for gesture state (no re-renders during drag/pinch) ──
  const pointers = useRef(new Map());
  const lastPinchDistance = useRef(null);
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  // Track displayed zoom for the zoom % indicator without re-rendering the whole board
  const [displayZoom, setDisplayZoom] = useState(1);

  const {
    zoom,
    setZoom,
    pan,
    setPan,
    BOARD_WIDTH,
    BOARD_HEIGHT,
    refreshTrigger,
    isBoardInteractive,
  } = useBoard();

  // Sync context values into refs on mount only
  useEffect(() => {
    panRef.current = pan;
    zoomRef.current = zoom;
    setDisplayZoom(zoom);
    applyTransform();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const blockedRoutes = ["/dashboard", "/operations", "/login", "/report"];
  const isBlocked =
    blockedRoutes.includes(location.pathname) ||
    !isBoardInteractive ||
    isModalOpen;

  const isBlockedRef = useRef(false);
  useEffect(() => {
    isBlockedRef.current = isBlocked;
  }, [isBlocked]);

  useEffect(() => {
    fetchPosts();
  }, [refreshTrigger]);

  async function fetchPosts() {
    try {
      const { data } = await axios.get(
        `${import.meta.env.VITE_API_URL}/data/posts`,
      );
      setPosts(data.posts);
    } catch (err) {
      console.error(err);
      setError("Failed to load posts");
    } finally {
      setLoading(false);
    }
  }

  // ── Stable function refs — wheel effect uses [] deps, never re-attaches ──
  const setPanRef = useRef(setPan);
  const setZoomRef = useRef(setZoom);
  useEffect(() => {
    setPanRef.current = setPan;
  }, [setPan]);
  useEffect(() => {
    setZoomRef.current = setZoom;
  }, [setZoom]);

  // Apply transform directly to DOM — zero React re-renders
  const applyTransform = useCallback(() => {
    if (!boardInnerRef.current) return;
    const { x, y } = panRef.current;
    const z = zoomRef.current;
    boardInnerRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${z})`;
  }, []); // stable — only uses refs

  // Commit ref values to context state
  const commitTransform = useCallback(() => {
    setPanRef.current({ ...panRef.current });
    setZoomRef.current(zoomRef.current);
    setDisplayZoom(zoomRef.current);
  }, []); // stable — only uses refs

  // ── Pointer events ──

  const handlePointerDown = useCallback(
    (e) => {
      if (isBlocked) return;
      boardRef.current?.setPointerCapture(e.pointerId);
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    },
    [isBlocked],
  );

  const handlePointerMove = useCallback(
    (e) => {
      if (isBlocked) return;
      if (!pointers.current.has(e.pointerId)) return;

      const prev = pointers.current.get(e.pointerId);
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;

      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // PAN (single pointer)
      if (pointers.current.size === 1) {
        panRef.current = {
          x: panRef.current.x + dx,
          y: panRef.current.y + dy,
        };
        applyTransform();
      }

      // PINCH ZOOM (two pointers)
      if (pointers.current.size === 2) {
        const pts = [...pointers.current.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;

        if (lastPinchDistance.current) {
          const scale = dist / lastPinchDistance.current;
          const currentZoom = zoomRef.current;
          const newZoom = Math.min(Math.max(0.1, currentZoom * scale), 3);

          const pointX = (midX - panRef.current.x) / currentZoom;
          const pointY = (midY - panRef.current.y) / currentZoom;

          zoomRef.current = newZoom;
          panRef.current = {
            x: midX - pointX * newZoom,
            y: midY - pointY * newZoom,
          };

          applyTransform();
        }

        lastPinchDistance.current = dist;
      }
    },
    [isBlocked, applyTransform],
  );

  const handlePointerUp = useCallback(
    (e) => {
      pointers.current.delete(e.pointerId);
      lastPinchDistance.current = null;
      if (pointers.current.size === 0) {
        commitTransform();
      }
    },
    [commitTransform],
  );

  // ── Wheel zoom — attached as native listener so we can use passive:false ──
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;

    const handleWheel = (e) => {
      if (isBlockedRef.current) return;
      e.preventDefault();

      const scale = 1 - e.deltaY * 0.001;
      const currentZoom = zoomRef.current;
      const newZoom = Math.min(Math.max(0.1, currentZoom * scale), 3);

      const pointX = (e.clientX - panRef.current.x) / currentZoom;
      const pointY = (e.clientY - panRef.current.y) / currentZoom;

      zoomRef.current = newZoom;
      panRef.current = {
        x: e.clientX - pointX * newZoom,
        y: e.clientY - pointY * newZoom,
      };

      applyTransform();

      clearTimeout(el._wheelTimer);
      el._wheelTimer = setTimeout(() => {
        commitTransform();
      }, 150);
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", handleWheel);
      clearTimeout(el._wheelTimer);
    };
  }, [loading]); // re-runs when loading finishes and boardRef becomes available

  // ── Button controls ──

  const handleZoomIn = () => {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const currentZoom = zoomRef.current;
    const newZoom = Math.min(currentZoom + 0.2, 3);

    zoomRef.current = newZoom;
    panRef.current = {
      x: cx - ((cx - panRef.current.x) / currentZoom) * newZoom,
      y: cy - ((cy - panRef.current.y) / currentZoom) * newZoom,
    };

    applyTransform();
    commitTransform();
  };

  const handleZoomOut = () => {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const currentZoom = zoomRef.current;
    const newZoom = Math.max(currentZoom - 0.2, 0.1);

    zoomRef.current = newZoom;
    panRef.current = {
      x: cx - ((cx - panRef.current.x) / currentZoom) * newZoom,
      y: cy - ((cy - panRef.current.y) / currentZoom) * newZoom,
    };

    applyTransform();
    commitTransform();
  };

  const handleResetView = () => {
    zoomRef.current = 1;
    panRef.current = {
      x: window.innerWidth / 2 - BOARD_WIDTH / 2,
      y: window.innerHeight / 2 - BOARD_HEIGHT / 2,
    };

    applyTransform();
    commitTransform();
  };

  // ── Loading / Error ──

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading posts...</p>
      </div>
    );

  if (error)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>{error}</p>
      </div>
    );

  const legendTransition = "transition-all duration-100 ease-in-out";

  return (
    <div className="relative w-full h-screen overflow-hidden bg-gradient-to-br from-gray-50 to-gray-200">
      {/* ── Blur overlay when board is blocked ── */}
      <div
        className="absolute inset-0 z-20 bg-white/10 transition-all duration-300 ease-in-out"
        style={{
          pointerEvents: isBlocked ? "all" : "none",
          backdropFilter: isBlocked ? "blur(10px)" : "blur(0px)",
          WebkitBackdropFilter: isBlocked ? "blur(10px)" : "blur(0px)",
          opacity: isBlocked ? 1 : 0,
        }}
      />

      {/* ── LEFT LEGEND ── */}

      {/* Desktop */}
      <div
        className={`absolute z-10 hidden min-[1690px]:block top-5 left-4 ${legendTransition}`}
        style={{
          transform: isBlocked ? "translateX(-150%)" : "translateX(0)",
          opacity: isBlocked ? 0 : 1,
        }}
      >
        <InfoCard posts={posts} />
      </div>

      {/* Tablet */}
      <div
        className={`absolute z-10 hidden md:max-[1689px]:block top-30 left-1/2 -translate-x-1/2 w-full max-w-7xl px-10 pointer-events-none ${legendTransition}`}
        style={{ opacity: isBlocked ? 0 : 1 }}
      >
        <div
          className={`inline-block pointer-events-auto ${legendTransition}`}
          style={{
            transform: isBlocked ? "translateX(-150%)" : "translateX(0)",
          }}
        >
          <InfoCard posts={posts} />
        </div>
      </div>

      {/* Mobile */}
      <div
        className={`absolute z-10 flex md:hidden top-20 left-4 ${legendTransition}`}
        style={{
          transform: isBlocked ? "translateX(-150%)" : "translateX(0)",
          opacity: isBlocked ? 0 : 1,
        }}
      >
        <div className="flex items-center gap-2 bg-white/90 backdrop-blur-sm rounded-lg shadow-md px-3 py-2">
          <img
            src="/logo-simple-bw.png"
            alt="Make A Post"
            className="h-4 w-auto object-contain opacity-70"
          />
          <span className="text-xs text-gray-300">|</span>
          <span className="text-xs text-gray-500">
            {posts.length} {posts.length === 1 ? "post" : "posts"}
          </span>
        </div>
      </div>

      {/* ── BOARD CANVAS ── */}
      <div
        ref={boardRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        style={{ touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div
          ref={boardInnerRef}
          style={{
            width: `${BOARD_WIDTH}px`,
            height: `${BOARD_HEIGHT}px`,
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
            transformOrigin: "0 0",
            position: "relative",
            backgroundColor: "#f4f5f7",
            backgroundImage: `
              linear-gradient(rgba(99, 102, 241, 0.07) 1px, transparent 1px),
              linear-gradient(90deg, rgba(99, 102, 241, 0.07) 1px, transparent 1px),
              linear-gradient(rgba(99, 102, 241, 0.03) 1px, transparent 1px),
              linear-gradient(90deg, rgba(99, 102, 241, 0.03) 1px, transparent 1px)
            `,
            backgroundSize: "100px 100px, 100px 100px, 20px 20px, 20px 20px",
          }}
        >
          {posts
            .filter((post) => {
              // Convert viewport bounds into board space, with padding so
              // posts don't pop in/out at the exact edge
              const padding = 300;
              const vLeft = (-pan.x - padding) / zoom;
              const vTop = (-pan.y - padding) / zoom;
              const vRight = (window.innerWidth - pan.x + padding) / zoom;
              const vBottom = (window.innerHeight - pan.y + padding) / zoom;

              const px = (post.position_x || 0) + BOARD_WIDTH / 2;
              const py = (post.position_y || 0) + BOARD_HEIGHT / 2;

              return px >= vLeft && px <= vRight && py >= vTop && py <= vBottom;
            })
            .map((post) => (
              <div
                key={post.id}
                style={{
                  position: "absolute",
                  left: `${(post.position_x || 0) + BOARD_WIDTH / 2}px`,
                  top: `${(post.position_y || 0) + BOARD_HEIGHT / 2}px`,
                  transform: "translate(-50%, -50%)",
                }}
              >
                <PostIt
                  message={post.message}
                  drawing={post.drawing}
                  link={post.link}
                  size={post.size}
                  color={post.color}
                  createdAt={post.iat}
                  expiresAt={post.exp}
                  isProtected={post.protected}
                  onModalOpen={() => setIsModalOpen(true)}
                  onModalClose={() => setIsModalOpen(false)}
                />
              </div>
            ))}
        </div>
      </div>

      {/* ── ZOOM CONTROLS ── */}

      {/* Desktop */}
      <div
        className={`absolute z-10 hidden min-[1690px]:block top-5 right-4 ${legendTransition}`}
        style={{
          transform: isBlocked ? "translateX(150%)" : "translateX(0)",
          opacity: isBlocked ? 0 : 1,
        }}
      >
        <ZoomCard
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onReset={handleResetView}
          zoom={displayZoom}
        />
      </div>

      {/* Tablet */}
      <div
        className={`absolute z-10 hidden md:max-[1689px]:block top-30 left-1/2 -translate-x-1/2 w-full max-w-7xl px-10 pointer-events-none ${legendTransition}`}
        style={{ opacity: isBlocked ? 0 : 1 }}
      >
        <div className="flex justify-end">
          <div
            className={`inline-block pointer-events-auto ${legendTransition}`}
            style={{
              transform: isBlocked ? "translateX(150%)" : "translateX(0)",
            }}
          >
            <ZoomCard
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              onReset={handleResetView}
              zoom={displayZoom}
            />
          </div>
        </div>
      </div>

      {/* Mobile */}
      <div
        className={`absolute z-10 flex md:hidden bottom-4 right-4 ${legendTransition}`}
        style={{
          transform: isBlocked ? "translateX(150%)" : "translateX(0)",
          opacity: isBlocked ? 0 : 1,
        }}
      >
        <div className="flex items-center gap-2 bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg px-3 py-3">
          <button
            onClick={handleZoomIn}
            className="w-11 h-11 flex items-center justify-center rounded-xl bg-blue-500 text-white shadow-sm
              transition-all duration-150 ease-out
              active:scale-90 active:bg-blue-700 active:shadow-inner
              hover:bg-blue-600"
          >
            <ZoomIn className="h-5 w-5" />
          </button>
          <button
            onClick={handleZoomOut}
            className="w-11 h-11 flex items-center justify-center rounded-xl bg-blue-500 text-white shadow-sm
              transition-all duration-150 ease-out
              active:scale-90 active:bg-blue-700 active:shadow-inner
              hover:bg-blue-600"
          >
            <ZoomOut className="h-5 w-5" />
          </button>
          <button
            onClick={handleResetView}
            className="w-11 h-11 flex items-center justify-center rounded-xl bg-gray-200 text-gray-600 shadow-sm
              transition-all duration-150 ease-out
              active:scale-90 active:bg-gray-400 active:shadow-inner
              hover:bg-gray-300"
          >
            <RotateCcw className="h-5 w-5" />
          </button>
          <span className="text-sm font-medium text-gray-500 pl-2 border-l border-gray-200 min-w-[3rem] text-center">
            {(displayZoom * 100).toFixed(0)}%
          </span>
        </div>
      </div>
    </div>
  );
}

function InfoCard({ posts }) {
  return (
    <div className="bg-white rounded-lg shadow-lg p-3">
      <img
        src="/logo-simple-bw.png"
        alt="Make A Post"
        className="h-4 w-auto object-contain mb-1"
      />
      <p className="text-sm text-gray-600">Scroll to zoom · Drag to pan</p>
      <p className="text-sm text-gray-600">Posts: {posts.length}</p>
    </div>
  );
}

function ZoomCard({ onZoomIn, onZoomOut, onReset, zoom }) {
  return (
    <div className="bg-white rounded-lg shadow-lg p-3 flex flex-col gap-2">
      <button
        onClick={onZoomIn}
        className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition text-sm font-medium"
      >
        Zoom In
        <ZoomIn className="h-4 w-4" />
      </button>

      <button
        onClick={onZoomOut}
        className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition text-sm font-medium"
      >
        Zoom Out
        <ZoomOut className="h-4 w-4" />
      </button>

      <button
        onClick={onReset}
        className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition text-sm font-medium"
      >
        Reset View
        <RotateCcw className="h-4 w-4" />
      </button>

      <div className="text-center text-sm text-gray-500">
        {(zoom * 100).toFixed(0)}%
      </div>
    </div>
  );
}

export default Board;
