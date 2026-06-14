import { Component } from "react";
import { FiAlertTriangle } from "react-icons/fi";

/**
 * Error boundary for the main app/page content.
 *
 * A render error in any page (e.g. rendering an object as a React child) must
 * NOT unmount the whole React root and leave a blank dark screen. Instead this
 * boundary catches it and shows a readable cream error panel with Retry and
 * Back to home, on the normal app background.
 *
 * Retry clears the error and re-renders the same page. "Back to home" asks the
 * parent to switch to the home tab (via onGoHome) and clears the error so the
 * crashing page is no longer mounted.
 */
export default class PageErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Surface for diagnostics; never swallow silently.
    console.error("[Queless] Page render error:", error, info);
    this.props.onError?.(error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false });
    this.props.onRetry?.();
  };

  handleGoHome = () => {
    this.setState({ hasError: false });
    this.props.onGoHome?.();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="page-error-v1" role="alert" data-testid="page-error">
        <div className="page-error-card-v1">
          <span className="page-error-icon-v1" aria-hidden="true">
            <FiAlertTriangle size={28} />
          </span>
          <strong className="page-error-title-v1">Something went wrong</strong>
          <p className="page-error-text-v1">
            This screen ran into a problem. You can retry, or go back to home.
          </p>
          <div className="page-error-actions-v1">
            <button type="button" className="page-error-retry-v1" onClick={this.handleRetry}>
              Retry
            </button>
            {this.props.onGoHome ? (
              <button type="button" className="page-error-home-v1" onClick={this.handleGoHome}>
                Back to home
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }
}
