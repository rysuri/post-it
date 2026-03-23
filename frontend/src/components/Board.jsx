import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import { useLocation } from "react-router-dom";
import axios from "axios";
import PostIt from "./PostIt";
import { useBoard } from "../BoardContext";
import { ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// InfoCard
// ─────────────────────────────────────────────────────────────────────────────

const InfoCard = memo(function InfoCard({ postCount }) {
  return (
    <div className="bg-white rounded-lg shadow-lg p-3">
      <img
        src="/logo-simple-bw.png"
        alt="Make A Post"
        className="h-4 w-auto object-contain mb-1"
      />
      <p className="text-sm text-gray-600">Scroll to zoom · Drag to pan</p>
      <p className="text-sm text-gray-600">Posts: {postCount}</p>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// ZoomCard
// ─────────────────────────────────────────────────────────────────────────────

const ZoomCard = memo(function ZoomCard({
  onZoomIn,
  onZoomOut,
  onReset,
  zoom,
}) {
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
});

// ─────────────────────────────────────────────────────────────────────────────
// PostItem — memoized so posts never re-render during pan/zoom or modal toggles
// ─────────────────────────────────────────────────────────────────────────────

const PostItem = memo(function PostItem({
  post,
  boardWidth,
  boardHeight,
  onModalOpen,
  onModalClose,
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: `${(post.position_x || 0) + boardWidth / 2}px`,
        top: `${(post.position_y || 0) + boardHeight / 2}px`,
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
        onModalOpen={onModalOpen}
        onModalClose={onModalClose}
      />
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Board
// ─────────────────────────────────────────────────────────────────────────────

function Board() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  // Isolated state for the zoom % display — updating this must not re-render
  // the board canvas or the post list.
  const [displayZoom, setDisplayZoom] = useState(1);

  const location = useLocation();
  const boardRef = useRef(null);
  const boardInnerRef = useRef(null);

  // Gesture state in refs — pointer/wheel handlers never need to re-create.
  const pointers = useRef(new Map());
  const lastPinchDistance = useRef(null);

  const {
    zoom,
    setZoom,
    pan,
    setPan,
    zoomRef,
    panRef,
    transformListenerRef,
    BOARD_WIDTH,
    BOARD_HEIGHT,
    refreshTrigger,
    isBoardInteractive,
  } = useBoard();

  // ── One-time synchronous ref initialization ───────────────────────────────
  //
  // This block runs during render (not in an effect), so panRef/zoomRef are
  // set BEFORE the JSX below is evaluated. That means the initial `transform`
  // style on boardInnerRef is already correct on the very first paint:
  //   • No top-left flash on reload.
  //   • No snap-to-origin on first click (commitTransform writes the same
  //     values that are already in the refs).
  //
  // • If the context already carries a non-origin pan (user navigated away
  //   and came back), restore it.
  // • Otherwise center the board in the viewport.
  //
  const initializedRef = useRef(false);
  if (!initializedRef.current) {
    initializedRef.current = true;
    const contextHasPan = pan.x !== 0 || pan.y !== 0;
    panRef.current = contextHasPan
      ? { ...pan }
      : {
          x: window.innerWidth / 2 - BOARD_WIDTH / 2,
          y: window.innerHeight / 2 - BOARD_HEIGHT / 2,
        };
    zoomRef.current = zoom || 1;
    setDisplayZoom(zoomRef.current);
  }

  // ── Stable setter refs ────────────────────────────────────────────────────
  const setPanRef = useRef(setPan);
  const setZoomRef = useRef(setZoom);
  useEffect(() => {
    setPanRef.current = setPan;
  }, [setPan]);
  useEffect(() => {
    setZoomRef.current = setZoom;
  }, [setZoom]);

  // ── Data fetching ─────────────────────────────────────────────────────────
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

  // ── Blocked state ─────────────────────────────────────────────────────────
  const blockedRoutes = ["/dashboard", "/operations", "/login", "/report"];
  const isBlocked =
    blockedRoutes.includes(location.pathname) ||
    !isBoardInteractive ||
    isModalOpen;

  const isBlockedRef = useRef(false);
  useEffect(() => {
    isBlockedRef.current = isBlocked;
  }, [isBlocked]);

  // ── Transform helpers ─────────────────────────────────────────────────────

  /**
   * Writes panRef/zoomRef directly to the DOM — zero React renders.
   * Also synchronously notifies the placement listener so the post-placement
   * preview stays in sync with zero lag.
   */
  const applyTransform = useCallback(() => {
    if (!boardInnerRef.current) return;
    const { x, y } = panRef.current;
    const z = zoomRef.current;
    boardInnerRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${z})`;
    transformListenerRef.current?.({ zoom: z, pan: { x, y } });
  }, []); // stable — only touches refs

  /**
   * Commits ref values into React context so other consumers (placement modal,
   * etc.) can read the final resting transform. Also updates the zoom %
   * indicator. Does NOT touch boardInnerRef, so the board canvas never
   * re-renders from this call.
   */
  const commitTransform = useCallback(() => {
    setPanRef.current({ ...panRef.current });
    setZoomRef.current(zoomRef.current);
    setDisplayZoom(zoomRef.current);
  }, []); // stable — only touches refs

  // Safety net: re-apply transform once the board DOM exists after loading.
  useEffect(() => {
    if (!loading) applyTransform();
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pointer handlers ──────────────────────────────────────────────────────

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

      if (pointers.current.size === 1) {
        // ── Pan ──
        panRef.current = {
          x: panRef.current.x + dx,
          y: panRef.current.y + dy,
        };
        applyTransform();
      } else if (pointers.current.size === 2) {
        // ── Pinch zoom ──
        const pts = [...pointers.current.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;

        if (lastPinchDistance.current) {
          const scale = dist / lastPinchDistance.current;
          const currentZoom = zoomRef.current;
          const newZoom = Math.min(Math.max(0.2, currentZoom * scale), 3);
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

  // ── Wheel zoom — native listener so we can call preventDefault ────────────
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;

    const handleWheel = (e) => {
      if (isBlockedRef.current) return;
      e.preventDefault();

      const scale = 1 - e.deltaY * 0.001;
      const currentZoom = zoomRef.current;
      const newZoom = Math.min(Math.max(0.2, currentZoom * scale), 3);
      const pointX = (e.clientX - panRef.current.x) / currentZoom;
      const pointY = (e.clientY - panRef.current.y) / currentZoom;

      zoomRef.current = newZoom;
      panRef.current = {
        x: e.clientX - pointX * newZoom,
        y: e.clientY - pointY * newZoom,
      };

      applyTransform();

      // Debounce context commit — only needed once the user stops scrolling.
      clearTimeout(el._wheelTimer);
      el._wheelTimer = setTimeout(() => commitTransform(), 150);
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", handleWheel);
      clearTimeout(el._wheelTimer);
    };
  }, [loading]); // re-attaches once the board DOM exists

  // ── Button controls ───────────────────────────────────────────────────────

  const handleZoomIn = useCallback(() => {
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
  }, [applyTransform, commitTransform]);

  const handleZoomOut = useCallback(() => {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const currentZoom = zoomRef.current;
    const newZoom = Math.max(currentZoom - 0.2, 0.3);

    zoomRef.current = newZoom;
    panRef.current = {
      x: cx - ((cx - panRef.current.x) / currentZoom) * newZoom,
      y: cy - ((cy - panRef.current.y) / currentZoom) * newZoom,
    };

    applyTransform();
    commitTransform();
  }, [applyTransform, commitTransform]);

  const handleResetView = useCallback(() => {
    zoomRef.current = 1;
    panRef.current = {
      x: window.innerWidth / 2 - BOARD_WIDTH / 2,
      y: window.innerHeight / 2 - BOARD_HEIGHT / 2,
    };

    applyTransform();
    commitTransform();
  }, [applyTransform, commitTransform, BOARD_WIDTH, BOARD_HEIGHT]);

  // ── Modal handlers — stable so PostItem memo is never invalidated ─────────
  const handleModalOpen = useCallback(() => setIsModalOpen(true), []);
  const handleModalClose = useCallback(() => setIsModalOpen(false), []);

  // ── Post elements — only recomputed when the posts array changes ──────────
  const postElements = useMemo(
    () =>
      posts.map((post) => (
        <PostItem
          key={post.id}
          post={post}
          boardWidth={BOARD_WIDTH}
          boardHeight={BOARD_HEIGHT}
          onModalOpen={handleModalOpen}
          onModalClose={handleModalClose}
        />
      )),
    [posts, BOARD_WIDTH, BOARD_HEIGHT, handleModalOpen, handleModalClose],
  );

  // ── Loading / error ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading posts...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>{error}</p>
      </div>
    );
  }

  const legendTransition = "transition-all duration-100 ease-in-out";

  // ─────────────────────────────────────────────────────────────────────────
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
        <InfoCard postCount={posts.length} />
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
          <InfoCard postCount={posts.length} />
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

      {/* ── BOARD CANVAS ──
          overflow:hidden clips posts outside the viewport via CSS — no JS
          culling, no flicker on mouse-up.
          ── */}
      <div
        ref={boardRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        style={{ touchAction: "none", overflow: "hidden" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/*
          Two deliberate choices on this div:

          1. `transform` reads from panRef/zoomRef, not React state.
             The values are initialized synchronously above the JSX, so the
             first paint already has the correct centered position — no flash
             and no snap-to-origin. applyTransform() owns all subsequent
             updates via direct DOM mutation; commitTransform() syncs context
             state for other consumers without causing this subtree to
             re-render.

          2. No `willChange: "transform"`.
             will-change: transform tells the browser to rasterize the
             entire subtree into a GPU texture at its current pixel size.
             When the board is then zoomed in, that texture gets magnified
             and CSS text becomes blurry. Drawings (canvas-based) have their
             own rasterization path and are less affected, which is why
             drawings looked sharp while text did not.
             translate3d already promotes the element to a compositor layer
             for smooth panning and zooming — will-change is redundant and
             harmful here.
        */}
        <div
          ref={boardInnerRef}
          style={{
            width: `${BOARD_WIDTH}px`,
            height: `${BOARD_HEIGHT}px`,
            transform: `translate3d(${panRef.current.x}px, ${panRef.current.y}px, 0) scale(${zoomRef.current})`,
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
          {postElements}
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

export default Board;
