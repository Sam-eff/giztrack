import { Component } from "react";
import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";

interface BoundaryProps {
  children: ReactNode;
  resetKey: string;
}

interface BoundaryState {
  error: Error | null;
}

const isOffline = () =>
  typeof navigator !== "undefined" ? !navigator.onLine : false;

function RouteLoadFallback({ error }: { error: Error | null }) {
  const offline = isOffline();
  const isChunkLoadError =
    error?.name === "ChunkLoadError" ||
    /failed to fetch dynamically imported module|loading chunk|import/i.test(error?.message || "");

  return (
    <div className="min-h-[100dvh] bg-app px-4 py-10 text-app">
      <div className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center text-center">
        <div
          className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border"
          style={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)" }}
        >
          <svg className="h-7 w-7 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 9v3.75m0 3.75h.01M4.93 19.07a10 10 0 1114.14 0 10 10 0 01-14.14 0z" />
          </svg>
        </div>
        <h1 className="font-display text-2xl font-extrabold">
          {offline && isChunkLoadError ? "This page is not cached yet" : "Page could not load"}
        </h1>
        <p className="mt-3 text-sm font-medium text-muted">
          {offline
            ? "Open this page once while connected, then it will be available when you lose internet access."
            : "The page bundle did not load correctly. Try again after checking your connection."}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

class RouteErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidUpdate(prevProps: BoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return <RouteLoadFallback error={this.state.error} />;
    }

    return this.props.children;
  }
}

export default function RouteLoadBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  const resetKey = `${location.pathname}${location.search}${location.hash}`;

  return <RouteErrorBoundary resetKey={resetKey}>{children}</RouteErrorBoundary>;
}
