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
    console.error("Critical Error Caught by Boundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px",
          textAlign: "center",
          backgroundColor: "#f8f9fa",
          color: "#343a40",
          fontFamily: "system-ui, -apple-system, sans-serif"
        }}>
          <h1 style={{ fontSize: "2rem", marginBottom: "1rem" }}>Oops! Something went wrong.</h1>
          <p style={{ marginBottom: "2rem", color: "#6c757d" }}>
            The chat application encountered an unexpected error.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "10px 20px",
              backgroundColor: "#1565d8",
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "1rem",
              fontWeight: "600"
            }}
          >
            Refresh Page
          </button>
          {process.env.NODE_ENV === "development" && (
            <pre style={{
              marginTop: "20px",
              padding: "15px",
              backgroundColor: "#e9ecef",
              borderRadius: "4px",
              maxWidth: "100%",
              overflow: "auto",
              textAlign: "left",
              fontSize: "0.8rem"
            }}>
              {this.state.error?.toString()}
            </pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
