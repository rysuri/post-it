import { Link } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { useEffect } from "react";

function Home() {
  const { user, loading } = useAuth();

  useEffect(() => {
    document.title = "Home · makeapost";
  }, []);

  // Don't show content while loading or if logged in
  if (loading || user) {
    return <></>;
  }

  return (
    <>
      <style>
        {`
          @keyframes gradient {
            0% {
              background-position: 0% 50%;
            }
            50% {
              background-position: 100% 50%;
            }
            100% {
              background-position: 0% 50%;
            }
          }

          .animate-gradient {
            animation: gradient 3s ease infinite;
            background-image: linear-gradient(to right, #fef08a, #fbcfe8, #bfdbfe);
            background-size: 200% 200%;
            -webkit-background-clip: text;
            background-clip: text;
            -webkit-text-fill-color: transparent;
          }
        `}
      </style>

      <div className="bg-white/80 backdrop-blur-md p-6 md:p-10 relative max-w-2xl mx-auto border border-white/20 shadow-2xl rounded-xl">
        <div className="space-y-6">
          <h1 className="text-xl md:text-3xl lg:text-4xl font-bold text-slate-900 text-center animate-[fadeInDown_0.5s_ease-out] tracking-tight">
            A few words are worth
            <br />
            <span className="animate-gradient">a thousand pictures.</span>
          </h1>

          <p
            className="text-slate-600 text-center text-sm md:text-base max-w-lg mx-auto animate-[fadeInUp_0.5s_ease-out]"
            style={{ animationDelay: "0.1s", animationFillMode: "backwards" }}
          >
            Sign in to view what everyone's posting — and stick something up
            yourself.
          </p>

          <div
            className="text-center animate-[fadeInUp_0.5s_ease-out]"
            style={{ animationDelay: "0.2s", animationFillMode: "backwards" }}
          >
            <Link
              to="/login"
              className="inline-block bg-slate-900 text-white px-6 py-3 md:px-8 md:py-4 rounded-xl text-sm md:text-base font-semibold hover:bg-slate-800 hover:scale-105 transition-all duration-300 shadow-xl hover:shadow-2xl"
            >
              Join the community
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

export default Home;
