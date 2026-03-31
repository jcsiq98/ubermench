'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '../../lib/auth-context';
import { useNotifications } from '../../lib/use-notifications';

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
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

export default function NotificationsPage() {
  const router = useRouter();
  const { isLoading: authLoading, isAuthenticated } = useAuth();
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
    if (!authLoading && !isAuthenticated) router.replace('/login');
  }, [authLoading, isAuthenticated, router]);

  const handleClick = (notif: any) => {
    if (!notif.readAt) markAsRead(notif.id);
    const url = notif.data?.url;
    if (url) router.push(url);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-4 pt-12 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-sm hover:bg-gray-200 transition-colors"
            >
              ←
            </button>
            <h1 className="text-lg font-bold text-gray-900">Notificaciones</h1>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="text-sm text-indigo-600 font-medium"
            >
              Marcar todas leídas
            </button>
          )}
        </div>
      </header>

      {/* Push permission banner */}
      {pushPermission === 'default' && (
        <div className="mx-4 mt-3 p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
          <p className="text-sm font-medium text-indigo-800">
            Activa las notificaciones push
          </p>
          <p className="text-xs text-indigo-600 mt-1">
            Recibe alertas al instante cuando llegue un nuevo trabajo, un mensaje o una actualización
          </p>
          <button
            onClick={requestPermission}
            className="mt-3 text-sm font-medium text-white bg-indigo-600 px-4 py-2 rounded-xl hover:bg-indigo-700 transition-colors"
          >
            Activar notificaciones
          </button>
        </div>
      )}

      {/* Notifications list */}
      <main className="flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <svg className="w-20 h-20 mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={0.75} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
            </svg>
            <p className="text-sm font-medium">No tienes notificaciones</p>
            <p className="text-xs mt-1">Te avisaremos de nuevas actividades aquí</p>
          </div>
        ) : (
          <div>
            {notifications.map((notif) => (
              <button
                key={notif.id}
                onClick={() => handleClick(notif)}
                className={`w-full text-left px-4 py-4 border-b border-gray-50 hover:bg-gray-50 transition-colors flex gap-3 ${
                  !notif.readAt ? 'bg-indigo-50/30' : ''
                }`}
              >
                <span className="text-xl flex-shrink-0 mt-0.5">
                  {TYPE_ICONS[notif.type] || '🔔'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm font-medium ${!notif.readAt ? 'text-gray-900' : 'text-gray-600'}`}>
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
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 flex-shrink-0 mt-2" />
                )}
              </button>
            ))}

            {hasMore && (
              <button
                onClick={loadMore}
                className="w-full py-4 text-sm text-indigo-600 hover:text-indigo-700 hover:bg-gray-50 font-medium"
              >
                Cargar más
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
