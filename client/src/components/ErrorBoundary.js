import React from "react";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
    console.error("Error stack:", error.stack);
  }

  render() {
    if (this.state.hasError) {
      const err = this.state.error;
      return (
        <div style={{ padding: 40, textAlign: "center" }}>
          <h2>Something went wrong</h2>
          <p style={{ color: "#888", marginBottom: 16 }}>
            {err?.message || "An unexpected error occurred"}
          </p>
          {err?.stack && (
            <pre style={{ fontSize: 11, color: "#aaa", textAlign: "left", maxWidth: 600, margin: "0 auto 16px", overflow: "auto", maxHeight: 200, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
              {err.stack}
            </pre>
          )}
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
            }}
            style={{
              padding: "8px 24px",
              background: "#667eea",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
