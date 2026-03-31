'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mb-4">
            <span className="text-3xl">⚠️</span>
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">
            Algo salió mal
          </h2>
          <p className="text-sm text-gray-500 mb-4 max-w-xs">
            Ocurrió un error inesperado. Por favor, intenta recargar la página.
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            Recargar página
          </button>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <pre className="mt-4 p-3 bg-gray-100 rounded-lg text-xs text-left overflow-auto max-w-full text-red-600">
              {this.state.error.message}
            </pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      fallback={
        <div className="flex flex-col items-center justify-center min-h-[40vh] p-6 text-center">
          <span className="text-4xl mb-3">😵</span>
          <h2 className="text-base font-bold text-gray-900 mb-1">
            Error al cargar esta sección
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Intenta de nuevo o regresa al inicio
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium"
            >
              Reintentar
            </button>
            <a
              href="/"
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600"
            >
              Ir al inicio
            </a>
          </div>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}
