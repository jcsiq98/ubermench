'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../lib/auth-context';
import { api } from '../../../lib/api';
import { requestPushToken } from '../../../lib/firebase';

interface NotifPrefs {
  bookingUpdates: boolean;
  messages: boolean;
  promotions: boolean;
  weeklyReport: boolean;
  pushEnabled: boolean;
  whatsappEnabled: boolean;
}

export default function NotificationSettingsPage() {
  const router = useRouter();
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const [prefs, setPrefs] = useState<NotifPrefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'default',
  );

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.replace('/login');
  }, [authLoading, isAuthenticated, router]);

  const loadPrefs = useCallback(async () => {
    try {
      const data = await api<NotifPrefs>('/notifications/preferences');
      setPrefs(data);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadPrefs();
  }, [loadPrefs]);

  const handleToggle = async (key: keyof NotifPrefs) => {
    if (!prefs) return;
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    try {
      await api('/notifications/preferences', {
        method: 'PATCH',
        body: JSON.stringify({ [key]: updated[key] }),
      });
    } catch {
      setPrefs(prefs);
    }
  };

  const handleEnablePush = async () => {
    const token = await requestPushToken();
    if (token) {
      await api('/notifications/device-token', {
        method: 'POST',
        body: JSON.stringify({ token, platform: 'web' }),
      }).catch(() => {});
      setPushPermission('granted');
    } else {
      setPushPermission(Notification.permission);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-4 pt-12 pb-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-sm hover:bg-gray-200 transition-colors"
          >
            ←
          </button>
          <h1 className="text-lg font-bold text-gray-900">
            Notificaciones
          </h1>
        </div>
      </header>

      <main className="px-4 py-4 space-y-4">
        {/* Push status */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-2">
            Push Notifications
          </h3>
          {pushPermission === 'granted' ? (
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <p className="text-sm text-green-700">Activadas</p>
            </div>
          ) : pushPermission === 'denied' ? (
            <div>
              <p className="text-sm text-red-600">
                Bloqueadas por el navegador
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Ve a la configuración del navegador para habilitarlas
              </p>
            </div>
          ) : (
            <div>
              <p className="text-sm text-gray-600 mb-3">
                Recibe alertas al instante sobre tus trabajos
              </p>
              <button
                onClick={handleEnablePush}
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                Activar push notifications
              </button>
            </div>
          )}
        </div>

        {/* Preferences */}
        {loading || !prefs ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-800">
                Preferencias
              </h3>
            </div>
            <div className="divide-y divide-gray-100">
              <ToggleRow
                label="Push notifications"
                description="Recibe alertas en tu dispositivo"
                value={prefs.pushEnabled}
                onChange={() => handleToggle('pushEnabled')}
              />
              <ToggleRow
                label="WhatsApp"
                description="Mensajes por WhatsApp"
                value={prefs.whatsappEnabled}
                onChange={() => handleToggle('whatsappEnabled')}
              />
              <ToggleRow
                label="Actualizaciones de trabajo"
                description="Cuando un trabajo cambia de estado"
                value={prefs.bookingUpdates}
                onChange={() => handleToggle('bookingUpdates')}
              />
              <ToggleRow
                label="Mensajes"
                description="Nuevos mensajes de clientes"
                value={prefs.messages}
                onChange={() => handleToggle('messages')}
              />
              <ToggleRow
                label="Reporte semanal"
                description="Resumen de actividad cada domingo"
                value={prefs.weeklyReport}
                onChange={() => handleToggle('weeklyReport')}
              />
              <ToggleRow
                label="Promociones"
                description="Ofertas y oportunidades"
                value={prefs.promotions}
                onChange={() => handleToggle('promotions')}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5">
      <div className="flex-1 min-w-0 mr-4">
        <p className="text-sm font-medium text-gray-800">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5">{description}</p>
      </div>
      <button
        onClick={onChange}
        className={`relative w-11 h-6 rounded-full transition-colors ${
          value ? 'bg-indigo-600' : 'bg-gray-200'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
            value ? 'translate-x-5' : ''
          }`}
        />
      </button>
    </div>
  );
}
