import { useAuth } from "../AuthContext";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";

export default function Dashboard() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/");
  }

  useEffect(() => {
    document.title = "Dashboard · makeapost";
  }, []);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="w-full flex items-center justify-center min-h-[60vh]">
        <p className="text-2xl text-gray-600">Loading...</p>
      </div>
    );
  }

  if (!user) {
    navigate("/");
    return (
      <div className="w-full flex items-center justify-center min-h-[60vh]">
        <p className="text-2xl text-gray-600">Not Authenticated...</p>
      </div>
    );
  }

  return (
    <div className="w-full flex items-center justify-center p-4 sm:p-6">
      <div className="bg-white p-6 sm:p-8 rounded-lg shadow-xl max-w-lg w-full animate-[slideUp_0.4s_ease-out]">
        <div className="space-y-6">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800 animate-[fadeIn_0.5s_ease-out]">
            Hey,{" "}
            {[user.given_name, user.family_name].filter(Boolean).join(" ") ||
              "there"}
            !
          </h1>

          <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 items-center sm:items-start animate-[fadeIn_0.6s_ease-out]">
            <img
              src={user.picture || "/user-placeholder.png"}
              alt={`${user.given_name} ${user.family_name}`}
              onError={(e) => (e.target.src = "/user-placeholder.png")}
              className="w-20 h-20 sm:w-24 sm:h-24 rounded-full shadow-md flex-shrink-0"
            />

            <div className="space-y-2 text-center sm:text-left text-gray-700 flex-1 w-full">
              <p className="text-sm sm:text-base break-words">
                <strong>Email:</strong> {user.email}
              </p>
              <p className="text-sm sm:text-base">
                <strong>Role:</strong> {user.role}
              </p>
              <p className="text-sm sm:text-base">
                <strong>Member since:</strong> {formatDate(user.created_at)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div
              className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center animate-[popIn_0.4s_ease-out]"
              style={{ animationDelay: "0.2s", animationFillMode: "backwards" }}
            >
              <p className="text-3xl font-bold text-gray-800">
                {user.posts_made ?? 0}
              </p>

              <p className="text-sm text-gray-600 mt-1">Posts made</p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="w-full bg-yellow-200 hover:bg-yellow-300 text-gray-800 font-semibold py-3 px-6 rounded-sm shadow-lg shadow-yellow-300/50 hover:shadow-xl transition-all duration-200 hover:scale-105 hover:rotate-1 animate-[fadeIn_0.7s_ease-out]"
            style={{ fontFamily: "'Indie Flower', cursive, sans-serif" }}
          >
            Logout
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

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
