import { Component } from "react";
import { FiAlertTriangle } from "react-icons/fi";

/**
 * Error boundary for lazy full-screen overlays.
 *
 * If the overlay's JS chunk fails to download (flaky network, stale deploy),
 * React surfaces the rejection here instead of leaving an infinite skeleton.
 * We render a clean cream error card with Retry + Close — never a native alert,
 * never a dark blank.
 *
 * Retry works by calling `onRetry`, which the parent uses to bump a counter that
 * also keys this boundary and recreates the lazy component — forcing a fresh
 * dynamic import rather than re-subscribing to the cached rejected promise.
 */
export default class OverlayErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    this.props.onError?.(error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false });
    this.props.onRetry?.();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const {
      title = "Something went wrong",
      message = "Please try again.",
      onClose,
      testId = "overlay-error",
    } = this.props;

    return (
      <div className="overlay-error-v1" role="alert" data-testid={testId}>
        <div className="overlay-error-card-v1">
          <span className="overlay-error-icon-v1" aria-hidden="true">
            <FiAlertTriangle size={26} />
          </span>
          <strong className="overlay-error-title-v1">{title}</strong>
          <p className="overlay-error-text-v1">{message}</p>
          <div className="overlay-error-actions-v1">
            <button type="button" className="overlay-error-retry-v1" onClick={this.handleRetry}>
              Retry
            </button>
            {onClose ? (
              <button type="button" className="overlay-error-close-v1" onClick={onClose}>
                Close
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }
}
