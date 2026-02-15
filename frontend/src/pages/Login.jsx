import { useGoogleLogin } from "@react-oauth/google";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { useEffect } from "react";
function Login() {
  const navigate = useNavigate();

  const googleLogin = useGoogleLogin({
    flow: "auth-code",
    onSuccess: async ({ code }) => {
      try {
        const response = await axios.post(
          `${import.meta.env.VITE_API_URL}/auth/google`,
          { code },
          { withCredentials: true },
        );

        console.log("Login response:", response);

        navigate("/dashboard");
        window.location.reload();
      } catch (error) {
        console.error("Login failed:", error.response || error);
      }
    },
    onError: (error) => {
      console.error("Google login error:", error);
    },
  });
  useEffect(() => {
    document.title = "Login · makeapost";
  }, []);
  return (
    <div className="">
      <div className="text-center">
        <div className="mb-12 animate-[fadeIn_0.6s_ease-out]">
          <h1
            className="text-6xl font-bold text-gray-800 mb-4"
            style={{ fontFamily: "'Indie Flower', cursive, sans-serif" }}
          >
            <Link to="/" className="px-4 py-2 flex justify-center items-center">
              <img
                src="/logo-simple-bw.png"
                alt="Make A Post"
                className="h-10 w-auto object-contain flex-shrink-0"
              />
            </Link>
          </h1>
          <p className="text-xl text-gray-600">Your thoughts, on our board</p>
        </div>

        <button
          onClick={() => googleLogin()}
          className="bg-white hover:bg-gradient-to-r text-gray-800 font-semibold py-4 px-8 rounded-lg shadow-lg hover:shadow-2xl transition-all duration-150 flex items-center gap-3 mx-auto animate-[popIn_0.5s_ease-out] hover:scale-110 hover:-rotate-1 active:scale-95"
          style={{ animationDelay: "0.1s", animationFillMode: "backwards" }}
        >
          <svg
            className="w-6 h-6 transition-transform duration-300 group-hover:rotate-12"
            viewBox="0 0 24 24"
          >
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          <span>Continue with Google</span>
        </button>

        <p
          className="mt-8 text-sm text-gray-500 animate-[fadeInUp_0.6s_ease-out]"
          style={{ animationDelay: "0s", animationFillMode: "backwards" }}
        >
          Sign in or create an account to get started
        </p>
      </div>

      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes popIn {
          from {
            opacity: 0;
            transform: scale(0.8);
          }
          50% {
            transform: scale(1.05);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

export default Login;
