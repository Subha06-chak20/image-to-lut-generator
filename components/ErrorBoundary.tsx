import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Renders a readable message instead of a blank (black) screen if a render-time
 * error escapes. Without this a crash leaves `#root` empty and, because the body
 * background is near-black, the page just looks black with no clue.
 */
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  // `@types/react` is not installed, so the base class resolves to `any` and
  // `this.props` is otherwise unknown to TypeScript.
  declare props: ErrorBoundaryProps;
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('S.CHAK STUDIO crashed:', error, info.componentStack);
  }

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-[100dvh] w-full flex items-center justify-center p-8 bg-background text-foreground">
        <div className="max-w-lg w-full rounded-lg border border-border bg-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <i className="fa-solid fa-triangle-exclamation text-yellow-500"></i>
            <h1 className="text-sm font-semibold">Something went wrong</h1>
          </div>
          <p className="text-xs text-muted-foreground">
            The interface hit an unexpected error. Details below.
          </p>
          <pre className="text-[11px] font-mono whitespace-pre-wrap break-words bg-secondary rounded-md p-3 max-h-64 overflow-auto">
            {error.message}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
