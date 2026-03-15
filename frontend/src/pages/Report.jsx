import { useState, useEffect } from "react";

function Contact() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    message: "",
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = "Contact · makeapost";
  }, []);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        alert("Message sent.");
        setFormData({ name: "", email: "", message: "" });
      } else {
        alert("Failed to send message.");
      }
    } catch (err) {
      console.error(err);
      alert("Cannot connect to server. Email me ASAP. rysu986@gmail.com");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        @keyframes fadeUp {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fade-up {
          opacity: 0;
          animation: fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
      `}</style>

      <div className="p-1 max-w-2xl mx-auto">
        <div
          className="animate-fade-up bg-white shadow-lg rounded-lg p-6 space-y-4"
          style={{ animationDelay: "0ms" }}
        >
          <h1
            className="animate-fade-up text-3xl font-bold text-slate-900 mb-4 text-center"
            style={{ animationDelay: "60ms" }}
          >
            Report an Issue
          </h1>

          <div
            className="animate-fade-up bg-slate-50 border border-slate-200 rounded-lg p-4 mb-6"
            style={{ animationDelay: "120ms" }}
          >
            <p className="text-sm text-slate-700">
              Report technical issues or content that violates safety
              guidelines. We remove content that causes harm while preserving
              free expression.
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div
              className="animate-fade-up"
              style={{ animationDelay: "180ms" }}
            >
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Your Name
              </label>
              <input
                type="text"
                name="name"
                placeholder="Enter your name"
                value={formData.name}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500"
              />
            </div>

            <div
              className="animate-fade-up"
              style={{ animationDelay: "240ms" }}
            >
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Your Email
              </label>
              <input
                type="email"
                name="email"
                placeholder="your@email.com"
                value={formData.email}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500"
              />
            </div>

            <div
              className="animate-fade-up"
              style={{ animationDelay: "300ms" }}
            >
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Your Message
              </label>
              <textarea
                name="message"
                placeholder="Describe the issue or concern"
                value={formData.message}
                onChange={handleChange}
                rows="5"
                required
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 resize-none"
              />
            </div>

            <div
              className="animate-fade-up"
              style={{ animationDelay: "360ms" }}
            >
              <button
                type="submit"
                disabled={loading}
                className="w-full px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors font-medium disabled:bg-slate-400 disabled:cursor-not-allowed"
              >
                {loading ? "Sending..." : "Send Report"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

export default Contact;
