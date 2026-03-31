'use client';

import { useState, useEffect } from 'react';
import { requestPushToken } from '../../lib/firebase';
import { api } from '../../lib/api';

export function PushNotificationPrompt() {
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'default') return;

    const dismissed = localStorage.getItem('handy_push_dismissed');
    if (dismissed) {
      const dismissedAt = parseInt(dismissed);
      if (Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000) return;
    }

    const timer = setTimeout(() => setShow(true), 5000);
    return () => clearTimeout(timer);
  }, []);

  if (!show) return null;

  const handleEnable = async () => {
    setLoading(true);
    try {
      const token = await requestPushToken();
      if (token) {
        await api('/notifications/device-token', {
          method: 'POST',
          body: JSON.stringify({ token, platform: 'web' }),
        }).catch(() => {});
      }
    } catch {
      // ignore
    }
    setShow(false);
  };

  const handleDismiss = () => {
    localStorage.setItem('handy_push_dismissed', String(Date.now()));
    setShow(false);
  };

  return (
    <div className="fixed bottom-20 left-4 right-4 max-w-[448px] mx-auto z-40 animate-slideInFromBottom">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4">
        <div className="flex gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="font-medium text-gray-900 text-sm">
              Recibe notificaciones al instante
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              Te avisamos cuando tu proveedor acepte, llegue o complete el trabajo
            </p>
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <button
            onClick={handleDismiss}
            className="flex-1 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Ahora no
          </button>
          <button
            onClick={handleEnable}
            disabled={loading}
            className="flex-1 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Activando...' : 'Activar'}
          </button>
        </div>
      </div>
    </div>
  );
}
