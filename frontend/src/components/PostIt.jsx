import PropTypes from "prop-types";
import { useRef, useEffect, useState } from "react";
import LinkWarningModal from "./Linkwarningmodal";
import { ShieldCheck } from "lucide-react";

function PostIt({
  message,
  drawing,
  link,
  size,
  color,
  createdAt,
  expiresAt,
  isProtected,
  onModalOpen,
  onModalClose,
}) {
  const canvasRef = useRef(null);
  const [showLinkWarning, setShowLinkWarning] = useState(false);

  useEffect(() => {
    if (!drawing || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    canvas.width = drawing.width || 200;
    canvas.height = drawing.height || 200;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (drawing.paths && drawing.paths.length > 0) {
      drawing.paths.forEach((path) => {
        if (path.points.length < 2) return;

        ctx.strokeStyle = path.color;
        ctx.lineWidth = path.size;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        ctx.beginPath();
        ctx.moveTo(path.points[0].x, path.points[0].y);

        for (let i = 1; i < path.points.length; i++) {
          ctx.lineTo(path.points[i].x, path.points[i].y);
        }

        ctx.stroke();
      });
    }
  }, [drawing]);

  const sizeClasses = {
    S: "w-32 h-32",
    M: "w-48 h-48",
    L: "w-64 h-64",
  };

  const textSizeClasses = {
    S: "text-sm",
    M: "text-base",
    L: "text-lg",
  };

  const colorClasses = {
    Y: "bg-yellow-200 shadow-yellow-300/50",
    P: "bg-pink-200 shadow-pink-300/50",
    B: "bg-blue-200 shadow-blue-300/50",
  };

  const handleLinkIconClick = (e) => {
    e.stopPropagation();
    setShowLinkWarning(true);
    if (onModalOpen) onModalOpen();
  };

  const handleConfirmNavigation = () => {
    window.open(link, "_blank", "noopener,noreferrer");
    setShowLinkWarning(false);
    if (onModalClose) onModalClose();
  };

  const handleModalClose = () => {
    setShowLinkWarning(false);
    if (onModalClose) onModalClose();
  };

  const protectedStyle = isProtected
    ? {
        boxShadow: `
          0 0 0 1.5px rgba(156, 211, 255, 0.95),
          0 0 12px rgba(66, 153, 225, 0.7),
          0 0 28px rgba(66, 153, 225, 0.35)
        `,
      }
    : {};

  return (
    <>
      <div className="relative inline-block">
        <div
          className={`
            ${sizeClasses[size] || sizeClasses.S}
            ${colorClasses[color] || colorClasses.Y}
            rounded-sm
            shadow-lg
            transform
            transition-transform
            relative
            select-none
          `}
          style={{
            fontFamily: "'Indie Flower', cursive, sans-serif",
            ...protectedStyle,
          }}
        >
          {/* Tape strip */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-4 bg-white/40 rounded-sm shadow-sm" />

          {isProtected && (
            <div className="absolute top-1.5 left-2 z-10">
              <ShieldCheck
                className="h-3 w-3"
                style={{ color: "rgb(156, 211, 255)" }}
              />
            </div>
          )}

          {/* Link icon */}
          {link && (
            <div
              onClick={handleLinkIconClick}
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute top-2 right-2 bg-white/80 rounded-full p-1 shadow-sm z-10 cursor-pointer hover:bg-white hover:scale-110 transition-all"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-3 w-3 text-blue-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </div>
          )}

          <div
            className={`w-full h-full flex items-center justify-center ${message ? "p-3" : ""}`}
          >
            {message && (
              <p
                className={`text-gray-800 leading-relaxed text-center break-words overflow-hidden ${textSizeClasses[size] || textSizeClasses.S}`}
              >
                {message}
              </p>
            )}
            {drawing && (
              <canvas
                ref={canvasRef}
                style={{
                  display: "block",
                  maxWidth: "100%",
                  maxHeight: "100%",
                  width: "auto",
                  height: "auto",
                }}
              />
            )}
          </div>

          <div className="absolute bottom-2 left-2 text-xs text-gray-600 opacity-60 z-10 pointer-events-none">
            {new Date(createdAt).toLocaleDateString()}
          </div>
        </div>
      </div>

      {link && (
        <LinkWarningModal
          isOpen={showLinkWarning}
          onClose={handleModalClose}
          onConfirm={handleConfirmNavigation}
          link={link}
        />
      )}
    </>
  );
}

PostIt.propTypes = {
  message: PropTypes.string,
  drawing: PropTypes.shape({
    paths: PropTypes.arrayOf(
      PropTypes.shape({
        points: PropTypes.arrayOf(
          PropTypes.shape({
            x: PropTypes.number.isRequired,
            y: PropTypes.number.isRequired,
          }),
        ).isRequired,
        color: PropTypes.string.isRequired,
        size: PropTypes.number.isRequired,
      }),
    ).isRequired,
    width: PropTypes.number,
    height: PropTypes.number,
  }),
  link: PropTypes.string,
  size: PropTypes.oneOf(["S", "M", "L"]).isRequired,
  color: PropTypes.oneOf(["Y", "P", "B"]).isRequired,
  createdAt: PropTypes.string.isRequired,
  expiresAt: PropTypes.string.isRequired,
  isProtected: PropTypes.bool,
  onModalOpen: PropTypes.func,
  onModalClose: PropTypes.func,
};

PostIt.defaultProps = {
  isProtected: false,
};

export default PostIt;
