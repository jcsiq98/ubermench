'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useCallback, Suspense } from 'react';
import { useAuth } from '../../lib/auth-context';
import { bookingsApi, type BookingSummary, type BookingStatus } from '../../lib/api';
import EmptyState from '../../components/ui/empty-state';
import ErrorState from '../../components/ui/error-state';
import { CardListSkeleton } from '../../components/ui/skeleton';

type FilterTab = 'all' | 'active' | 'completed' | 'cancelled';

const STATUS_BADGE: Record<
  BookingStatus,
  { label: string; color: string; icon: string }
> = {
  PENDING: { label: 'Pendiente', color: 'bg-yellow-50 text-yellow-700', icon: '⏳' },
  ACCEPTED: { label: 'Aceptado', color: 'bg-blue-50 text-blue-700', icon: '✅' },
  PROVIDER_ARRIVING: { label: 'En camino', color: 'bg-indigo-50 text-indigo-700', icon: '🚗' },
  IN_PROGRESS: { label: 'En progreso', color: 'bg-purple-50 text-purple-700', icon: '🔧' },
  COMPLETED: { label: 'Completado', color: 'bg-green-50 text-green-700', icon: '🎉' },
  RATED: { label: 'Calificado', color: 'bg-green-50 text-green-700', icon: '⭐' },
  CANCELLED: { label: 'Cancelado', color: 'bg-red-50 text-red-700', icon: '❌' },
  REJECTED: { label: 'Rechazado', color: 'bg-red-50 text-red-700', icon: '🚫' },
};

function BookingsHistoryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoading: authLoading, isAuthenticated } = useAuth();

  const initialTab = (searchParams.get('status') as FilterTab) || 'all';

  const [bookings, setBookings] = useState<BookingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>(initialTab);
  const [total, setTotal] = useState(0);

  const loadBookings = useCallback(
    async (tab: FilterTab) => {
      setLoading(true);
      setError(null);
      try {
        const status = tab === 'all' ? undefined : (tab as 'active' | 'completed' | 'cancelled');
        const res = await bookingsApi.list({ status, limit: 50 });
        setBookings(res.data);
        setTotal(res.total);
      } catch (err: unknown) {
        console.error('Failed to load bookings:', err);
        setError('No se pudieron cargar las solicitudes');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (isAuthenticated) {
      loadBookings(activeTab);
    }
  }, [isAuthenticated, activeTab, loadBookings]);

  if (authLoading || !isAuthenticated) return null;

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'Todas' },
    { key: 'active', label: 'Activas' },
    { key: 'completed', label: 'Completadas' },
    { key: 'cancelled', label: 'Canceladas' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white border-b border-gray-100 px-5 pt-12 pb-3">
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => router.push('/')}
            className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
          >
            ←
          </button>
          <div>
            <h1 className="text-lg font-bold text-gray-800">Mis Solicitudes</h1>
            <p className="text-xs text-gray-500">
              {loading ? 'Cargando...' : `${total} solicitudes`}
            </p>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* Booking list */}
      <main className="flex-1 px-5 py-4">
        {loading ? (
          <CardListSkeleton count={4} />
        ) : error ? (
          <ErrorState
            message={error}
            onRetry={() => loadBookings(activeTab)}
            onBack={() => router.push('/')}
          />
        ) : bookings.length === 0 ? (
          <EmptyState
            icon="📋"
            title="No tienes solicitudes"
            description={
              activeTab === 'all'
                ? 'Cuando solicites un servicio, aparecerá aquí'
                : `No tienes solicitudes ${
                    activeTab === 'active'
                      ? 'activas'
                      : activeTab === 'completed'
                        ? 'completadas'
                        : 'canceladas'
                  }`
            }
            action={
              activeTab === 'all'
                ? { label: 'Explorar servicios', onClick: () => router.push('/') }
                : { label: 'Ver todas', onClick: () => setActiveTab('all') }
            }
          />
        ) : (
          <div className="space-y-3 stagger-children">
            {bookings.map((booking) => {
              const badge = STATUS_BADGE[booking.status];
              const createdDate = new Date(booking.createdAt);
              const isDismissable = ['CANCELLED', 'REJECTED', 'COMPLETED', 'RATED'].includes(booking.status);

              return (
                <div key={booking.id} className="relative">
                  <button
                    onClick={() => router.push(`/bookings/${booking.id}`)}
                    className="w-full bg-white rounded-2xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-all text-left active:scale-[0.98]"
                  >
                    <div className="flex items-start gap-3 mb-3">
                      {/* Provider avatar */}
                      {booking.provider?.avatarUrl ? (
                        <img
                          src={booking.provider.avatarUrl}
                          alt=""
                          className="w-10 h-10 rounded-full object-cover bg-gray-100 shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-bold shrink-0">
                          {(booking.provider?.name || '?')[0]}
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-gray-800 text-sm truncate">
                            {booking.provider?.name || 'Proveedor'}
                          </p>
                          <span
                            className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${badge.color}`}
                          >
                            {badge.icon} {badge.label}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {booking.category?.icon} {booking.category?.name}
                        </p>
                      </div>
                    </div>

                    <p className="text-xs text-gray-600 line-clamp-2 mb-2">
                      {booking.description}
                    </p>

                    <div className="flex items-center justify-between text-[10px] text-gray-400">
                      <span>
                        {createdDate.toLocaleDateString('es-MX', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                      {booking.address && (
                        <span className="truncate max-w-[50%]">
                          📍 {booking.address}
                        </span>
                      )}
                    </div>

                    {/* Quick chat button for active bookings */}
                    {['ACCEPTED', 'PROVIDER_ARRIVING', 'IN_PROGRESS'].includes(booking.status) && (
                      <div
                        className="mt-3 pt-3 border-t border-gray-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/chat/${booking.id}`);
                        }}
                      >
                        <div className="w-full py-2 bg-indigo-50 text-indigo-700 rounded-xl text-xs font-semibold text-center hover:bg-indigo-100 transition-colors">
                          💬 Chatear con {booking.provider?.name || 'proveedor'}
                        </div>
                      </div>
                    )}
                  </button>

                  {/* Dismiss button for cancelled/rejected/completed bookings */}
                  {isDismissable && (
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!confirm('¿Eliminar esta solicitud de tu historial?')) return;
                        try {
                          await bookingsApi.dismiss(booking.id);
                          setBookings((prev) => prev.filter((b) => b.id !== booking.id));
                          setTotal((prev) => prev - 1);
                        } catch {
                          alert('No se pudo eliminar la solicitud');
                        }
                      }}
                      className="absolute top-3 right-3 w-7 h-7 rounded-full bg-gray-100 hover:bg-red-100 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors text-xs"
                      title="Eliminar"
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className="sticky bottom-0 px-2 py-2 bg-white border-t border-gray-100 safe-bottom">
        <div className="flex items-center justify-around">
          {[
            { icon: '🏠', label: 'Inicio', href: '/', active: false },
            { icon: '🔍', label: 'Buscar', href: '/providers', active: false },
            { icon: '📋', label: 'Mis Pedidos', href: '/bookings', active: true },
            { icon: '💬', label: 'Chat', href: '/bookings?status=active', active: false },
            { icon: '👤', label: 'Perfil', href: '/profile', active: false },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => item.href !== '#' && router.push(item.href)}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-colors ${
                item.active
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

export default function BookingsHistoryPage() {
  return (
    <Suspense fallback={<CardListSkeleton />}>
      <BookingsHistoryContent />
    </Suspense>
  );
}
