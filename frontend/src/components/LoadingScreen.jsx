import "./LoadingScreen.css";
import logo from "../assets/queless-logo-full.png";

export default function LoadingScreen({ visible = true }) {
  return (
    <div
      className={`queless-loading-screen ${visible ? "is-visible" : "is-hiding"}`}
      role="status"
      aria-live="polite"
      aria-label="Loading Queless"
    >
      <span className="queless-loading-cloud left" aria-hidden="true" />
      <span className="queless-loading-cloud right" aria-hidden="true" />
      <span className="queless-loading-map" aria-hidden="true" />

      <div className="queless-loading-content">
        <div className="queless-loading-logo-wrap">
          <span className="queless-loading-glow" aria-hidden="true" />
          <img className="queless-loading-logo" src={logo} alt="Queless" />
        </div>

        <p className="queless-loading-copy">Booking smarter</p>
        <p className="queless-loading-tagline">Queue less. Live more.</p>
      </div>

      <svg
        className="queless-loading-route"
        viewBox="0 0 390 160"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="queless-route-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f0a7b4" />
            <stop offset="48%" stopColor="#c35acb" />
            <stop offset="100%" stopColor="#7a3fe8" />
          </linearGradient>
          <filter id="queless-route-dot-shadow" x="-80%" y="-80%" width="260%" height="260%">
            <feDropShadow dx="0" dy="7" stdDeviation="5" floodColor="#6f2fd3" floodOpacity="0.28" />
          </filter>
        </defs>

        <path
          id="queless-loading-route-path"
          className="queless-loading-route-path"
          d="M -24 72 C 54 46 112 54 178 92 C 241 129 313 127 414 68"
        />

        <g className="queless-loading-route-node" filter="url(#queless-route-dot-shadow)">
          <circle r="13.5" fill="#ffffff" />
          <circle r="8.2" fill="#8d3faf" />
          <circle r="3.2" fill="#ffffff" />
          <animateMotion dur="3.4s" repeatCount="indefinite" rotate="0">
            <mpath href="#queless-loading-route-path" />
          </animateMotion>
        </g>
      </svg>
    </div>
  );
}
