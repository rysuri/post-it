import { Link } from "react-router-dom";
import { useEffect } from "react";

function Operations() {
  useEffect(() => {
    document.title = "Operations · makeapost";
  }, []);
  return (
    <div className="flex flex-col sm:flex-row gap-8 justify-center items-center">
      <Link
        to="/operations/draw"
        className="w-64 h-64 bg-blue-200 shadow-lg shadow-blue-300/50 p-4 rounded-sm transform transition-all duration-150 hover:scale-110 hover:rotate-2 cursor-pointer flex flex-col relative select-none animate-[popIn_0.15s_ease-out]"
        style={{
          fontFamily: "'Indie Flower', cursive, sans-serif",
          animationDelay: "0s",
          animationFillMode: "backwards",
        }}
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-4 bg-white/40 rounded-sm shadow-sm" />
        <div className="flex-1 flex items-center justify-center">
          <span className="text-2xl font-semibold text-gray-800">
            Draw a picture
          </span>
        </div>
      </Link>

      <Link
        to="/operations/add"
        className="w-64 h-64 bg-pink-200 shadow-lg shadow-pink-300/50 p-4 rounded-sm transform transition-all duration-150 hover:scale-110 hover:-rotate-2 cursor-pointer flex flex-col relative select-none animate-[popIn_0.15s_ease-out]"
        style={{
          fontFamily: "'Indie Flower', cursive, sans-serif",
          animationDelay: ".1s",
          animationFillMode: "backwards",
        }}
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-4 bg-white/40 rounded-sm shadow-sm" />
        <div className="flex-1 flex items-center justify-center">
          <span className="text-2xl font-semibold text-gray-800">
            Write a message
          </span>
        </div>
      </Link>

      <style>{`
        @keyframes popIn {
          from {
            opacity: 0;
            transform: scale(0.8);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
}

export default Operations;
