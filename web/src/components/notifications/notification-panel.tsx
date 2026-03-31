'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useNotifications } from '../../lib/use-notifications';

function timeAgo(date: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(date).getTime()) / 1000,
  );
  if (seconds < 60) return 'ahora';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
}

const TYPE_ICONS: Record<string, string> = {
  booking_update: '📋',
  message: '💬',
  rating: '⭐',
  system: '🔔',
  promotion: '🎉',
};

interface Props {
  onClose: () => void;
}

export function NotificationPanel({ onClose }: Props) {
  const router = useRouter();
  const {
    notifications,
    unreadCount,
    isLoading,
    hasMore,
    markAsRead,
    markAllAsRead,
    loadMore,
    requestPermission,
    pushPermission,
  } = useNotifications();

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const handleClick = (notif: any) => {
    if (!notif.readAt) markAsRead(notif.id);
    const url = notif.data?.url;
    if (url) router.push(url);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white animate-slideInFromBottom">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h2 className="text-lg font-semibold">Notificaciones</h2>
        <div className="flex items-center gap-3">
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="text-sm text-indigo-600 hover:text-indigo-700"
            >
              Marcar todas leídas
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Push permission banner */}
      {pushPermission === 'default' && (
        <div className="mx-4 mt-3 p-3 bg-indigo-50 rounded-xl border border-indigo-100">
          <p className="text-sm text-indigo-800 mb-2">
            Activa las notificaciones push para recibir alertas al instante
          </p>
          <button
            onClick={requestPermission}
            className="text-sm font-medium text-white bg-indigo-600 px-4 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Activar notificaciones
          </button>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <svg className="w-16 h-16 mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
            </svg>
            <p className="text-sm">No tienes notificaciones</p>
          </div>
        ) : (
          <>
            {notifications.map((notif) => (
              <button
                key={notif.id}
                onClick={() => handleClick(notif)}
                className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors flex gap-3 ${
                  !notif.readAt ? 'bg-indigo-50/40' : ''
                }`}
              >
                <span className="text-xl flex-shrink-0 mt-0.5">
                  {TYPE_ICONS[notif.type] || '🔔'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className={`text-sm font-medium truncate ${
                        !notif.readAt ? 'text-gray-900' : 'text-gray-600'
                      }`}
                    >
                      {notif.title}
                    </p>
                    <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
                      {timeAgo(notif.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">
                    {notif.body}
                  </p>
                </div>
                {!notif.readAt && (
                  <span className="w-2 h-2 rounded-full bg-indigo-600 flex-shrink-0 mt-2" />
                )}
              </button>
            ))}

            {hasMore && (
              <button
                onClick={loadMore}
                className="w-full py-3 text-sm text-indigo-600 hover:text-indigo-700 hover:bg-gray-50"
              >
                Cargar más
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
