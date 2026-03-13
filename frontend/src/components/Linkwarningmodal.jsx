import PropTypes from "prop-types";
import { createPortal } from "react-dom";

function LinkWarningModal({ isOpen, onClose, onConfirm, link }) {
  if (!isOpen) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ margin: 0 }}
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fadeIn"
        onClick={onClose}
      />

      <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full p-8 animate-scaleIn">
        <div className="flex justify-center mb-6">
          <div className="bg-yellow-100 rounded-full p-4">
            <svg
              className="h-12 w-12 text-yellow-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
        </div>

        <div className="text-center mb-6">
          <h3 className="text-2xl font-bold text-gray-900 mb-3">
            You are leaving this site
          </h3>
          <p className="text-base text-gray-600 mb-6">
            This link is user-generated and not monitored. We cannot guarantee
            the safety or content of external websites.
          </p>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-500 mb-1">
              You will be redirected to:
            </p>
            <p className="text-sm text-gray-800 font-mono break-all">{link}</p>
          </div>

          <p className="text-base text-gray-700 font-medium">
            Do you want to continue?
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 text-base font-semibold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-all duration-200 hover:shadow-md"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-6 py-3 text-base font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-all duration-200 hover:shadow-lg"
          >
            Continue
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes scaleIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }
        .animate-scaleIn {
          animation: scaleIn 0.2s ease-out;
        }
      `}</style>
    </div>
  );

  return createPortal(modalContent, document.body);
}

LinkWarningModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
  link: PropTypes.string.isRequired,
};

export default LinkWarningModal;
