function Footer() {
  return (
    <div className="bg-white/80 backdrop-blur-md text-black p-4 shadow-lg border border-white/20">
      <div className="w-full mx-auto px-4 flex items-center justify-between">
        <p>
          <strong>rysuri</strong> powered 2026
        </p>

        <div className="flex items-center space-x-3">
          <a
            href="https://x.com/intent/post?url=https%3A%2F%2Fmakeapost.it%2F"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:opacity-70 transition-opacity"
            aria-label="Share on X"
          >
            <img
              src="/x-logo.svg"
              alt="X logo"
              className="w-4 h-4 filter invert"
            />
          </a>
          <a
            href="https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fmakeapost.it%2F
"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:opacity-70 transition-opacity"
            aria-label="Share on X"
          >
            <img
              src="/fb-logo.png"
              alt="Facebook logo"
              className="w-4 h-4 filter invert"
            />
          </a>
        </div>
      </div>
    </div>
  );
}

export default Footer;
