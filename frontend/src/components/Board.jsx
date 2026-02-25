import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import axios from "axios";
import PostIt from "./PostIt";
import { useBoard } from "../BoardContext";
import { ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

function Board() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isModalOpen, setIsModalOpen] = useState(false);

  const location = useLocation();
  const boardRef = useRef(null);

  // Touch state stored in a ref to avoid stale closures inside event listeners
  const touchState = useRef({
    isDragging: false,
    lastX: 0,
    lastY: 0,
    lastDist: null, // distance between two fingers for pinch
  });

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

  // Keep a ref to current zoom/pan so touch handlers (attached once) can read latest values
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  const blockedRoutes = ["/dashboard", "/operations", "/login", "/report"];
  const isBlocked =
    blockedRoutes.includes(location.pathname) ||
    !isBoardInteractive ||
    isModalOpen;
  const isBlockedRef = useRef(isBlocked);
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
    } catch (error) {
      console.error("Error fetching posts:", error);
      setError("Failed to load posts");
    } finally {
      setLoading(false);
    }
  }

  // ── Attach touch listeners with passive:false so we can preventDefault ──
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;

    const getDistance = (t1, t2) => {
      const dx = t1.clientX - t2.clientX;
      const dy = t1.clientY - t2.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const getMidpoint = (t1, t2) => ({
      x: (t1.clientX + t2.clientX) / 2,
      y: (t1.clientY + t2.clientY) / 2,
    });

    const onTouchStart = (e) => {
      if (isBlockedRef.current) return;
      e.preventDefault();

      if (e.touches.length === 1) {
        touchState.current = {
          isDragging: true,
          lastX: e.touches[0].clientX,
          lastY: e.touches[0].clientY,
          lastDist: null,
        };
      } else if (e.touches.length === 2) {
        touchState.current = {
          isDragging: false,
          lastX: 0,
          lastY: 0,
          lastDist: getDistance(e.touches[0], e.touches[1]),
        };
      }
    };

    const onTouchMove = (e) => {
      if (isBlockedRef.current) return;
      e.preventDefault();

      const currentZoom = zoomRef.current;
      const currentPan = panRef.current;

      if (e.touches.length === 1 && touchState.current.isDragging) {
        // Single finger pan
        const dx = e.touches[0].clientX - touchState.current.lastX;
        const dy = e.touches[0].clientY - touchState.current.lastY;
        touchState.current.lastX = e.touches[0].clientX;
        touchState.current.lastY = e.touches[0].clientY;
        setPan({ x: currentPan.x + dx, y: currentPan.y + dy });
      } else if (e.touches.length === 2) {
        // Two finger pinch-to-zoom
        const newDist = getDistance(e.touches[0], e.touches[1]);
        const mid = getMidpoint(e.touches[0], e.touches[1]);

        if (touchState.current.lastDist !== null) {
          const scale = newDist / touchState.current.lastDist;
          const newZoom = Math.min(Math.max(0.1, currentZoom * scale), 3);

          // Zoom toward the midpoint between the two fingers
          const pointX = (mid.x - currentPan.x) / currentZoom;
          const pointY = (mid.y - currentPan.y) / currentZoom;
          setZoom(newZoom);
          setPan({
            x: mid.x - pointX * newZoom,
            y: mid.y - pointY * newZoom,
          });
        }

        touchState.current.lastDist = newDist;
      }
    };

    const onTouchEnd = (e) => {
      if (e.touches.length === 0) {
        touchState.current.isDragging = false;
        touchState.current.lastDist = null;
      } else if (e.touches.length === 1) {
        // Went from 2 fingers to 1 — switch to pan mode
        touchState.current.isDragging = true;
        touchState.current.lastX = e.touches[0].clientX;
        touchState.current.lastY = e.touches[0].clientY;
        touchState.current.lastDist = null;
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: false });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // ^ intentionally empty — we use refs for live values

  // ── Mouse handlers (desktop unchanged) ──
  const handleWheel = (e) => {
    if (isBlocked) return;
    e.preventDefault();
    const delta = e.deltaY * -0.001;
    const newZoom = Math.min(Math.max(0.1, zoom * (1 + delta)), 3);
    const pointX = (e.clientX - pan.x) / zoom;
    const pointY = (e.clientY - pan.y) / zoom;
    setZoom(newZoom);
    setPan({
      x: e.clientX - pointX * newZoom,
      y: e.clientY - pointY * newZoom,
    });
  };

  const handleMouseDown = (e) => {
    if (isBlocked) return;
    if (e.button === 0) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e) => {
    if (isBlocked) return;
    if (isDragging)
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => {
    if (isBlocked) return;
    setIsDragging(false);
  };

  const handleZoomIn = () => {
    if (isBlocked) return;
    const cx = window.innerWidth / 2,
      cy = window.innerHeight / 2;
    const newZoom = Math.min(zoom + 0.2, 3);
    setPan({
      x: cx - ((cx - pan.x) / zoom) * newZoom,
      y: cy - ((cy - pan.y) / zoom) * newZoom,
    });
    setZoom(newZoom);
  };

  const handleZoomOut = () => {
    if (isBlocked) return;
    const cx = window.innerWidth / 2,
      cy = window.innerHeight / 2;
    const newZoom = Math.max(zoom - 0.2, 0.1);
    setPan({
      x: cx - ((cx - pan.x) / zoom) * newZoom,
      y: cy - ((cy - pan.y) / zoom) * newZoom,
    });
    setZoom(newZoom);
  };

  const handleResetView = () => {
    if (isBlocked) return;
    setZoom(1);
    setPan({
      x: window.innerWidth / 2 - BOARD_WIDTH / 2,
      y: window.innerHeight / 2 - BOARD_HEIGHT / 2,
    });
  };

  if (loading)
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-200 flex items-center justify-center">
        <p className="text-xl text-gray-600">Loading posts...</p>
      </div>
    );

  if (error)
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-200 flex items-center justify-center">
        <p className="text-xl text-red-500">{error}</p>
      </div>
    );

  const legendTransition = "transition-all duration-100 ease-in-out";

  return (
    <div className="relative w-full h-screen overflow-hidden bg-gradient-to-br from-gray-50 to-gray-200">
      {/* Blur overlay */}
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

      {/* Desktop (≥1690px): flush top-left */}
      <div
        className={`absolute z-10 hidden min-[1690px]:block top-5 left-4 ${legendTransition}`}
        style={{
          transform: isBlocked ? "translateX(-150%)" : "translateX(0)",
          opacity: isBlocked ? 0 : 1,
        }}
      >
        <InfoCard posts={posts} />
      </div>

      {/* Tablet (768–1689px): constrained within max-w-7xl, below navbar */}
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

      {/* Mobile (<768px): compact pill, top-left, below navbar */}
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

      {/* ── RIGHT LEGEND (zoom controls) ── */}

      {/* Desktop (≥1690px): flush top-right */}
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
          zoom={zoom}
        />
      </div>

      {/* Tablet (768–1689px): constrained within max-w-7xl, below navbar — right-aligned */}
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
              zoom={zoom}
            />
          </div>
        </div>
      </div>

      {/* Mobile (<768px): compact pill, bottom-right */}
      <div
        className={`absolute z-10 flex md:hidden bottom-18 right-4 ${legendTransition}`}
        style={{
          transform: isBlocked ? "translateX(150%)" : "translateX(0)",
          opacity: isBlocked ? 0 : 1,
        }}
      >
        <div className="flex items-center gap-1 bg-white/90 backdrop-blur-sm rounded-lg shadow-md px-2 py-2">
          <button
            onClick={handleZoomIn}
            className="p-1.5 rounded hover:bg-gray-100 transition text-gray-700"
            title="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-1.5 rounded hover:bg-gray-100 transition text-gray-700"
            title="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            onClick={handleResetView}
            className="p-1.5 rounded hover:bg-gray-100 transition text-gray-700"
            title="Reset view"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <span className="text-xs text-gray-500 pl-1.5 border-l border-gray-200">
            {(zoom * 100).toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Board canvas */}
      <div
        ref={boardRef}
        className={`w-full h-full ${!isBlocked && isDragging ? "cursor-grabbing" : !isBlocked ? "cursor-grab" : "cursor-default"}`}
        style={{ touchAction: "none" }} // critical: tells browser we handle all touch ourselves
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          style={{
            width: `${BOARD_WIDTH}px`,
            height: `${BOARD_HEIGHT}px`,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
            backgroundImage: `
              linear-gradient(rgba(0, 0, 0, 0.05) 1px, transparent 1px),
              linear-gradient(90deg, rgba(0, 0, 0, 0.05) 1px, transparent 1px)
            `,
            backgroundSize: "50px 50px",
            backgroundColor: "#f9fafb",
            position: "relative",
          }}
        >
          {posts.length === 0 ? (
            <div
              style={{
                position: "absolute",
                left: `${BOARD_WIDTH / 2}px`,
                top: `${BOARD_HEIGHT / 2}px`,
                transform: "translate(-50%, -50%)",
              }}
            >
              <p className="text-center text-gray-500 text-lg">
                No posts yet. Create your first post-it!
              </p>
            </div>
          ) : (
            posts.map((post) => (
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
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────

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
