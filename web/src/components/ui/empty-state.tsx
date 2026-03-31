'use client';

interface EmptyStateProps {
  icon: string;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center animate-scale-in">
      <span className="text-6xl mb-4">{icon}</span>
      <h3 className="text-lg font-semibold text-gray-800 mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-gray-500 mb-6 max-w-[260px]">
          {description}
        </p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl text-sm font-semibold active:scale-95 transition-transform shadow-md shadow-indigo-200"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

