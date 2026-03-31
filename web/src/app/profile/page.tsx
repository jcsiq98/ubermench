'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../lib/auth-context';
import { api, addressesApi, type SavedAddress } from '../../lib/api';
import { NotificationBell } from '../../components/notifications/notification-bell';

interface HistoryItem {
  id: string;
  status: string;
  description: string;
  address: string | null;
  price: number | null;
  createdAt: string;
  completedAt: string | null;
  category: { name: string; icon: string } | null;
  provider: { name: string | null; avatarUrl: string | null } | null;
  myRating: number | null;
}

interface NotifPrefs {
  bookingUpdates: boolean;
  messages: boolean;
  promotions: boolean;
  weeklyReport: boolean;
  pushEnabled: boolean;
  whatsappEnabled: boolean;
}

type Tab = 'info' | 'history' | 'addresses' | 'settings';

export default function ProfilePage() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAuthenticated, logout, refreshUser } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('info');

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [saving, setSaving] = useState(false);

  // History state
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyTotal, setHistoryTotal] = useState(0);

  // Addresses state
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [addressesLoading, setAddressesLoading] = useState(false);

  // Notification prefs state
  const [prefs, setPrefs] = useState<NotifPrefs | null>(null);
  const [prefsLoading, setPrefsLoading] = useState(false);

  // Delete account
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.replace('/login');
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (user) {
      setEditName(user.name || '');
      setEditEmail(user.email || '');
    }
  }, [user]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await api<{ data: HistoryItem[]; total: number }>(
        '/users/me/history?limit=50',
      );
      setHistory(res.data);
      setHistoryTotal(res.total);
    } catch { /* ignore */ }
    setHistoryLoading(false);
  }, []);

  const loadAddresses = useCallback(async () => {
    setAddressesLoading(true);
    try {
      const data = await addressesApi.list();
      setAddresses(data);
    } catch { /* ignore */ }
    setAddressesLoading(false);
  }, []);

  const loadPrefs = useCallback(async () => {
    setPrefsLoading(true);
    try {
      const data = await api<NotifPrefs>('/notifications/preferences');
      setPrefs(data);
    } catch { /* ignore */ }
    setPrefsLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab === 'history') loadHistory();
    if (activeTab === 'addresses') loadAddresses();
    if (activeTab === 'settings') loadPrefs();
  }, [activeTab, loadHistory, loadAddresses, loadPrefs]);

  if (authLoading || !isAuthenticated || !user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  const initials = (user.name || user.phone || '?').slice(0, 2).toUpperCase();

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await api('/users/me/profile', {
        method: 'PUT',
        body: JSON.stringify({
          name: editName || undefined,
          email: editEmail || undefined,
        }),
      });
      await refreshUser();
      setEditing(false);
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', 'handy_avatars');

    try {
      const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || 'handy';
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        { method: 'POST', body: formData },
      );
      const data = await res.json();
      if (data.secure_url) {
        await api('/users/me/profile', {
          method: 'PUT',
          body: JSON.stringify({ avatarUrl: data.secure_url }),
        });
        await refreshUser();
      }
    } catch { /* ignore */ }
  };

  const handleTogglePref = async (key: keyof NotifPrefs) => {
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

  const handleDeleteAddress = async (id: string) => {
    try {
      await addressesApi.delete(id);
      setAddresses((prev) => prev.filter((a) => a.id !== id));
    } catch { /* ignore */ }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      await api('/users/me/account', { method: 'DELETE' });
      await logout();
      router.replace('/login');
    } catch { /* ignore */ }
    setDeleting(false);
  };

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'info', label: 'Perfil', icon: '👤' },
    { id: 'history', label: 'Historial', icon: '📋' },
    { id: 'addresses', label: 'Direcciones', icon: '📍' },
    { id: 'settings', label: 'Ajustes', icon: '⚙️' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-gradient-to-br from-indigo-600 to-purple-600 text-white px-5 pt-14 pb-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors text-sm"
            >
              ←
            </button>
            <h1 className="text-lg font-bold">Mi Perfil</h1>
          </div>
          <NotificationBell />
        </div>

        <div className="flex items-center gap-4">
          <label className="relative cursor-pointer group">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt=""
                className="w-20 h-20 rounded-full object-cover border-4 border-white/30 shadow-lg"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold border-4 border-white/30 shadow-lg">
                {initials}
              </div>
            )}
            <div className="absolute inset-0 rounded-full bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <span className="text-xs text-white font-medium">Cambiar</span>
            </div>
            <input
              type="file"
              accept="image/*"
              onChange={handleAvatarUpload}
              className="hidden"
            />
          </label>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold truncate">
              {user.name || 'Sin nombre'}
            </h2>
            <p className="text-indigo-200 text-sm">{user.phone}</p>
            {user.ratingAverage !== undefined && user.ratingAverage > 0 && (
              <div className="flex items-center gap-1 mt-1">
                <span className="text-yellow-300 text-sm">★</span>
                <span className="text-sm text-indigo-100">
                  {user.ratingAverage.toFixed(1)} ({user.ratingCount})
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="px-4 -mt-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-1 flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2 rounded-xl text-xs font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <span className="mr-1">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 px-4 pt-4 pb-24">
        {/* ─── Info Tab ─── */}
        {activeTab === 'info' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-800">
                  Información personal
                </h3>
                <button
                  onClick={() => setEditing(!editing)}
                  className="text-xs text-indigo-600 font-medium"
                >
                  {editing ? 'Cancelar' : 'Editar'}
                </button>
              </div>

              {editing ? (
                <div className="p-5 space-y-4">
                  <div>
                    <label className="text-xs text-gray-500 font-medium">
                      Nombre
                    </label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full mt-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="Tu nombre"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 font-medium">
                      Email
                    </label>
                    <input
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      className="w-full mt-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="tu@email.com"
                    />
                  </div>
                  <button
                    onClick={handleSaveProfile}
                    disabled={saving}
                    className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    {saving ? 'Guardando...' : 'Guardar cambios'}
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  <InfoRow icon="📱" label="Teléfono" value={user.phone} />
                  <InfoRow icon="👤" label="Nombre" value={user.name || 'Sin nombre'} />
                  <InfoRow icon="📧" label="Email" value={user.email || 'No configurado'} />
                  <InfoRow
                    icon="🎭"
                    label="Cuenta"
                    value={user.role === 'PROVIDER' ? 'Proveedor' : user.role === 'ADMIN' ? 'Admin' : 'Cliente'}
                  />
                  {user.createdAt && (
                    <InfoRow
                      icon="📅"
                      label="Miembro desde"
                      value={new Date(user.createdAt).toLocaleDateString('es-MX', {
                        year: 'numeric',
                        month: 'long',
                      })}
                    />
                  )}
                </div>
              )}
            </div>

            {/* Provider stats */}
            {user.providerProfile && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <h3 className="text-sm font-semibold text-gray-800 mb-3">
                  Estadísticas de Proveedor
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <StatBox label="Trabajos" value={String(user.providerProfile.totalJobs)} />
                  <StatBox
                    label="Calificación"
                    value={user.ratingAverage ? `${user.ratingAverage.toFixed(1)} ★` : 'N/A'}
                  />
                  <StatBox label="Reseñas" value={String(user.ratingCount || 0)} />
                </div>
              </div>
            )}

            {/* Quick links */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <LinkRow icon="📋" label="Mis Solicitudes" onClick={() => router.push('/bookings')} />
              <LinkRow icon="💬" label="Chats Activos" onClick={() => router.push('/bookings?status=active')} />
              <LinkRow icon="🆘" label="Contactos de emergencia" onClick={() => router.push('/settings/emergency')} />
              <LinkRow icon="🔒" label="Aviso de privacidad" onClick={() => router.push('/privacy')} />
              {user.role === 'PROVIDER' && (
                <LinkRow icon="🏢" label="Panel de Proveedor" onClick={() => router.push('/provider')} />
              )}
            </div>

            <button
              onClick={handleLogout}
              className="w-full py-3.5 bg-white border border-red-200 text-red-600 rounded-2xl font-semibold text-sm hover:bg-red-50 transition-colors shadow-sm"
            >
              Cerrar sesión
            </button>
          </div>
        )}

        {/* ─── History Tab ─── */}
        {activeTab === 'history' && (
          <div>
            {historyLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <p className="text-4xl mb-2">📋</p>
                <p className="text-sm">Aún no tienes historial de servicios</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-gray-400 font-medium px-1">
                  {historyTotal} servicio{historyTotal !== 1 ? 's' : ''} en total
                </p>
                {history.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => router.push(`/bookings/${item.id}`)}
                    className="w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-4 text-left hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">{item.category?.icon || '🔧'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {item.category?.name || 'Servicio'}
                          </p>
                          <StatusBadge status={item.status} />
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 truncate">
                          {item.description}
                        </p>
                        {item.provider && (
                          <p className="text-xs text-gray-400 mt-1">
                            {item.provider.name || 'Proveedor'}
                          </p>
                        )}
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs text-gray-400">
                            {new Date(item.createdAt).toLocaleDateString('es-MX', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </span>
                          {item.myRating && (
                            <span className="text-xs text-yellow-600">
                              {'★'.repeat(item.myRating)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── Addresses Tab ─── */}
        {activeTab === 'addresses' && (
          <div>
            {addressesLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
              </div>
            ) : addresses.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <p className="text-4xl mb-2">📍</p>
                <p className="text-sm">No tienes direcciones guardadas</p>
                <p className="text-xs mt-1">
                  Se guardarán automáticamente al solicitar un servicio
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {addresses.map((addr) => (
                  <div
                    key={addr.id}
                    className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">
                            {addr.label === 'Mi casa' ? '🏠' : addr.label === 'Oficina' ? '🏢' : '📍'}
                          </span>
                          <p className="text-sm font-medium text-gray-900">
                            {addr.label}
                          </p>
                          {addr.isDefault && (
                            <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-medium">
                              Principal
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                          {addr.address}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteAddress(addr.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── Settings Tab ─── */}
        {activeTab === 'settings' && (
          <div className="space-y-4">
            {/* Notification settings */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-800">
                  Notificaciones
                </h3>
              </div>
              {prefsLoading || !prefs ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  <ToggleRow
                    label="Push notifications"
                    description="Recibe alertas al instante en tu dispositivo"
                    value={prefs.pushEnabled}
                    onChange={() => handleTogglePref('pushEnabled')}
                  />
                  <ToggleRow
                    label="WhatsApp"
                    description="Mensajes por WhatsApp (onboarding y proveedores)"
                    value={prefs.whatsappEnabled}
                    onChange={() => handleTogglePref('whatsappEnabled')}
                  />
                  <ToggleRow
                    label="Actualizaciones de trabajo"
                    description="Cuando tu proveedor acepta, llega o termina"
                    value={prefs.bookingUpdates}
                    onChange={() => handleTogglePref('bookingUpdates')}
                  />
                  <ToggleRow
                    label="Mensajes"
                    description="Nuevos mensajes en tus chats"
                    value={prefs.messages}
                    onChange={() => handleTogglePref('messages')}
                  />
                  <ToggleRow
                    label="Reporte semanal"
                    description="Resumen de actividad cada domingo"
                    value={prefs.weeklyReport}
                    onChange={() => handleTogglePref('weeklyReport')}
                  />
                  <ToggleRow
                    label="Promociones"
                    description="Ofertas especiales y descuentos"
                    value={prefs.promotions}
                    onChange={() => handleTogglePref('promotions')}
                  />
                </div>
              )}
            </div>

            {/* Danger zone */}
            <div className="bg-white rounded-2xl shadow-sm border border-red-100 overflow-hidden">
              <div className="px-5 py-3 border-b border-red-100">
                <h3 className="text-sm font-semibold text-red-600">
                  Zona de peligro
                </h3>
              </div>
              <div className="p-5">
                <p className="text-xs text-gray-500 mb-3">
                  Al eliminar tu cuenta, se borrarán tus datos personales,
                  direcciones guardadas y preferencias de forma permanente. Los
                  registros de servicios se anonimizarán según la LFPDPPP.
                </p>
                {showDeleteConfirm ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-red-600">
                      ¿Estás seguro? Esta acción no se puede deshacer.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        className="flex-1 py-2 text-sm text-gray-600 rounded-xl border border-gray-200 hover:bg-gray-50"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleDeleteAccount}
                        disabled={deleting}
                        className="flex-1 py-2 text-sm font-medium text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-50"
                      >
                        {deleting ? 'Eliminando...' : 'Eliminar cuenta'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="w-full py-2.5 text-sm text-red-600 border border-red-200 rounded-xl hover:bg-red-50 transition-colors"
                  >
                    Eliminar mi cuenta
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-[480px] mx-auto px-2 py-2 bg-white border-t border-gray-100 safe-bottom">
        <div className="flex items-center justify-around">
          {[
            { icon: '🏠', label: 'Inicio', href: '/' },
            { icon: '🔍', label: 'Buscar', href: '/providers' },
            { icon: '📋', label: 'Mis Pedidos', href: '/bookings' },
            { icon: '💬', label: 'Chat', href: '/bookings?status=active' },
            { icon: '👤', label: 'Perfil', href: '/profile', active: true },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => router.push(item.href)}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-colors ${
                'active' in item && item.active
                  ? 'text-indigo-600'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-5 py-3.5">
      <span className="text-lg shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-gray-400 uppercase tracking-wider">{label}</p>
        <p className="text-sm text-gray-800 font-medium truncate">{value}</p>
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-indigo-50 rounded-xl p-3 text-center">
      <p className="text-lg font-bold text-indigo-700">{value}</p>
      <p className="text-[10px] text-indigo-500 font-medium mt-0.5">{label}</p>
    </div>
  );
}

function LinkRow({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <>
      <button
        onClick={onClick}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-lg">{icon}</span>
        <span className="text-sm font-medium text-gray-800 flex-1">{label}</span>
        <span className="text-gray-400 text-sm">→</span>
      </button>
      <div className="border-t border-gray-100" />
    </>
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

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    COMPLETED: 'bg-green-100 text-green-700',
    RATED: 'bg-green-100 text-green-700',
    CANCELLED: 'bg-red-100 text-red-700',
    REJECTED: 'bg-red-100 text-red-700',
    PENDING: 'bg-yellow-100 text-yellow-700',
    ACCEPTED: 'bg-blue-100 text-blue-700',
    IN_PROGRESS: 'bg-indigo-100 text-indigo-700',
    PROVIDER_ARRIVING: 'bg-blue-100 text-blue-700',
  };
  const labels: Record<string, string> = {
    COMPLETED: 'Completado',
    RATED: 'Calificado',
    CANCELLED: 'Cancelado',
    REJECTED: 'Rechazado',
    PENDING: 'Pendiente',
    ACCEPTED: 'Aceptado',
    IN_PROGRESS: 'En progreso',
    PROVIDER_ARRIVING: 'En camino',
  };

  return (
    <span
      className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
        styles[status] || 'bg-gray-100 text-gray-600'
      }`}
    >
      {labels[status] || status}
    </span>
  );
}
