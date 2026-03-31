'use client';

interface LoadingSpinnerProps {
  text?: string;
  size?: 'sm' | 'md' | 'lg';
  fullScreen?: boolean;
}

export default function LoadingSpinner({
  text = 'Cargando...',
  size = 'md',
  fullScreen = false,
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-6 h-6 border-2',
    md: 'w-10 h-10 border-3',
    lg: 'w-14 h-14 border-4',
  };

  const spinner = (
    <div className="flex flex-col items-center gap-3 animate-fade-in">
      <div
        className={`${sizeClasses[size]} border-indigo-200 border-t-indigo-600 rounded-full animate-spin`}
      />
      {text && <p className="text-sm text-gray-500">{text}</p>}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        {spinner}
      </div>
    );
  }

  return <div className="flex items-center justify-center py-12">{spinner}</div>;
}

