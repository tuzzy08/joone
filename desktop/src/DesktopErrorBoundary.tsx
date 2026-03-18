import React from "react";

interface DesktopErrorBoundaryProps {
  children: React.ReactNode;
}

interface DesktopErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class DesktopErrorBoundary extends React.Component<
  DesktopErrorBoundaryProps,
  DesktopErrorBoundaryState
> {
  state: DesktopErrorBoundaryState = {
    hasError: false,
    message: "",
  };

  static getDerivedStateFromError(error: Error): DesktopErrorBoundaryState {
    return {
      hasError: true,
      message: error.message,
    };
  }

  componentDidCatch(error: Error): void {
    console.error("Desktop shell crashed", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="desktop-fallback">
          <section className="desktop-fallback-card">
            <h1>Desktop shell crashed</h1>
            <p>
              Joone hit a render-time error before the desktop shell could recover.
            </p>
            <p className="error-text">
              Last error: {this.state.message || "Unknown desktop error"}
            </p>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
