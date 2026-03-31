'use client';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  onBack?: () => void;
}

export default function ErrorState({
  title = 'Algo salió mal',
  message = 'No pudimos completar la operación. Intenta de nuevo.',
  onRetry,
  onBack,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center animate-scale-in">
      <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center mb-4">
        <span className="text-4xl">😕</span>
      </div>
      <h3 className="text-lg font-semibold text-gray-800 mb-1">{title}</h3>
      <p className="text-sm text-gray-500 mb-6 max-w-[280px]">{message}</p>
      <div className="flex gap-3">
        {onBack && (
          <button
            onClick={onBack}
            className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors"
          >
            ← Volver
          </button>
        )}
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold active:scale-95 transition-transform"
          >
            🔄 Reintentar
          </button>
        )}
      </div>
    </div>
  );
}

