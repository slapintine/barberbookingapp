import { FiArrowRight } from "react-icons/fi";

export default function EmptyState({ icon, title, text, actionLabel, onAction }) {
  return (
    <div className="queless-empty-state">
      {icon ? <span className="queless-empty-icon">{icon}</span> : null}
      <strong>{title}</strong>
      <p>{text}</p>
      {actionLabel && onAction ? (
        <button type="button" onClick={onAction}>
          {actionLabel}
          <FiArrowRight aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

