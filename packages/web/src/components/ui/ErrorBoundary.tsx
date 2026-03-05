import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-[100dvh] flex-col items-center justify-center gap-4 bg-surface-950 px-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-danger/10">
            <AlertTriangle className="h-7 w-7 text-accent-danger" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-white">
              Algo salió mal
            </h2>
            <p className="mt-1 text-sm text-surface-400">
              Ha ocurrido un error inesperado.
            </p>
          </div>
          <button
            onClick={this.handleRetry}
            className="mt-2 flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-500"
          >
            <RefreshCw className="h-4 w-4" />
            Reintentar
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
