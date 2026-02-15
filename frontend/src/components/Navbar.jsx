import { Link } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { useState } from "react";

function Navbar() {
  const { user, loading } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = () => setIsOpen(!isOpen);
  const closeMenu = () => setIsOpen(false);

  return (
    <div className="relative">
      <div className="flex justify-between items-center bg-white/80 backdrop-blur-md text-black p-3 shadow-lg border border-white/20">
        <Link to="/" className="px-4 py-2" onClick={closeMenu}>
          {/* Mobile Logo */}
          <img
            src="/makeapost.svg"
            alt="Make A Post"
            className="h-8 w-auto object-contain flex-shrink-0 sm:hidden"
          />
          {/* Desktop Logo */}
          <img
            src="/logo-bw.png"
            alt="Make A Post"
            className="h-8 w-auto object-contain flex-shrink-0 hidden sm:block"
          />
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex gap-4">
          <Link to="/report" className="px-4 py-2">
            Report
          </Link>
          <Link to="/operations" className="px-4 py-2">
            Operations
          </Link>

          {!loading && (
            <>
              {!user ? (
                <Link to="/login" className="px-4 py-2">
                  Login
                </Link>
              ) : (
                <>
                  <Link to="/dashboard" className="px-4 py-2">
                    Dashboard
                  </Link>
                </>
              )}
            </>
          )}
        </div>

        {/* Mobile Hamburger Button */}
        <button
          onClick={toggleMenu}
          className="md:hidden px-4 py-2 focus:outline-none"
          aria-label="Toggle menu"
        >
          <div className="w-6 h-5 flex flex-col justify-between">
            <span className="block h-0.5 w-full bg-black"></span>
            <span className="block h-0.5 w-full bg-black"></span>
            <span className="block h-0.5 w-full bg-black"></span>
          </div>
        </button>
      </div>

      {/* Mobile Menu */}
      <div
        className={`md:hidden absolute top-full left-0 right-0 bg-white/95 backdrop-blur-md border-x border-b border-white/20 shadow-lg transition-all duration-300 overflow-hidden ${
          isOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="flex flex-col p-2">
          {!loading && (
            <>
              {!user ? (
                <Link
                  to="/login"
                  className="px-4 py-3 hover:bg-black/5 transition-colors"
                  onClick={closeMenu}
                >
                  Login
                </Link>
              ) : (
                <>
                  <Link
                    to="/dashboard"
                    className="px-4 py-3 hover:bg-black/5 transition-colors"
                    onClick={closeMenu}
                  >
                    Dashboard
                  </Link>
                </>
              )}
            </>
          )}
          <Link
            to="/operations"
            className="px-4 py-3 hover:bg-black/5 transition-colors"
            onClick={closeMenu}
          >
            Operations
          </Link>

          <Link
            to="/report"
            className="px-4 py-3 hover:bg-black/5 transition-colors"
            onClick={closeMenu}
          >
            Report
          </Link>
        </div>
      </div>
    </div>
  );
}

export default Navbar;
