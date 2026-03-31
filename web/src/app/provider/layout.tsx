'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth-context';
import { NotificationBell } from '../../components/notifications/notification-bell';
import { PushNotificationPrompt } from '../../components/notifications/push-prompt';

const NAV_ITEMS = [
  { href: '/provider', label: 'Dashboard', icon: '📊' },
  { href: '/provider/jobs', label: 'Trabajos', icon: '📋' },
  { href: '/provider/earnings', label: 'Ganancias', icon: '💰' },
  { href: '/provider/profile', label: 'Perfil', icon: '👤' },
];

export default function ProviderLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading, isAuthenticated } = useAuth();
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    setIsOnline(navigator.onLine);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isLoading || !isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col pb-20">
      {/* Offline banner */}
      {!isOnline && (
        <div className="bg-amber-500 text-white text-center py-1.5 text-xs font-medium">
          Sin conexión — los cambios se sincronizarán al reconectar
        </div>
      )}

      {/* Header */}
      <header className="bg-gradient-to-r from-indigo-600 to-purple-700 px-5 pt-12 pb-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-indigo-200 text-xs font-medium">Modo Proveedor</p>
            <h1 className="text-white text-lg font-bold">{user?.name || 'Proveedor'}</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-white">
              <NotificationBell />
            </div>
            <button
              onClick={() => router.push('/')}
              className="px-3 py-1.5 bg-white/20 text-white rounded-lg text-xs font-medium hover:bg-white/30 transition-colors"
            >
              Modo Cliente →
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1">{children}</main>

      {/* Push notification prompt */}
      <PushNotificationPrompt />

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 safe-bottom">
        <div className="max-w-[480px] mx-auto flex">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={`flex-1 flex flex-col items-center py-2.5 text-xs transition-colors ${
                  isActive ? 'text-indigo-600 font-semibold' : 'text-gray-400'
                }`}
              >
                <span className="text-lg mb-0.5">{item.icon}</span>
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
