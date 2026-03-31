'use client';

import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../../../lib/auth-context';
import {
  bookingsApi,
  ratingsApi,
  reportsApi,
  safetyApi,
  type BookingSummary,
  type BookingStatus,
  type MyRatingResponse,
  type ProviderLocationData,
} from '../../../lib/api';

const STATUS_CONFIG: Record<
  BookingStatus,
  { label: string; color: string; icon: string; description: string }
> = {
  PENDING: {
    label: 'Pendiente',
    color: 'text-yellow-600 bg-yellow-50',
    icon: '⏳',
    description: 'Esperando respuesta del proveedor',
  },
  ACCEPTED: {
    label: 'Aceptado',
    color: 'text-blue-600 bg-blue-50',
    icon: '✅',
    description: 'El proveedor aceptó tu solicitud',
  },
  PROVIDER_ARRIVING: {
    label: 'En camino',
    color: 'text-indigo-600 bg-indigo-50',
    icon: '🚗',
    description: 'El proveedor va en camino a tu ubicación',
  },
  IN_PROGRESS: {
    label: 'En progreso',
    color: 'text-purple-600 bg-purple-50',
    icon: '🔧',
    description: 'El proveedor está trabajando en tu solicitud',
  },
  COMPLETED: {
    label: 'Completado',
    color: 'text-green-600 bg-green-50',
    icon: '🎉',
    description: 'El servicio ha sido completado',
  },
  RATED: {
    label: 'Calificado',
    color: 'text-green-600 bg-green-50',
    icon: '⭐',
    description: 'Ya calificaste este servicio',
  },
  CANCELLED: {
    label: 'Cancelado',
    color: 'text-red-600 bg-red-50',
    icon: '❌',
    description: 'Esta solicitud fue cancelada',
  },
  REJECTED: {
    label: 'Rechazado',
    color: 'text-red-600 bg-red-50',
    icon: '🚫',
    description: 'El proveedor rechazó la solicitud',
  },
};

const TIMELINE_STEPS: BookingStatus[] = [
  'PENDING',
  'ACCEPTED',
  'PROVIDER_ARRIVING',
  'IN_PROGRESS',
  'COMPLETED',
];

export default function BookingTrackingPage() {
  const router = useRouter();
  const params = useParams();
  const bookingId = params.id as string;
  const { isLoading: authLoading, isAuthenticated } = useAuth();

  const [booking, setBooking] = useState<BookingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [myRating, setMyRating] = useState<MyRatingResponse | null>(null);
  const [hasReported, setHasReported] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showSosConfirm, setShowSosConfirm] = useState(false);
  const [sosTriggered, setSosTriggered] = useState(false);
  const [providerLocation, setProviderLocation] = useState<ProviderLocationData | null>(null);
  const [reportForm, setReportForm] = useState({ category: '', description: '' });
  const [submittingReport, setSubmittingReport] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const loadBooking = useCallback(async () => {
    try {
      const data = await bookingsApi.getById(bookingId);
      setBooking(data);

      if (data.status === 'COMPLETED' || data.status === 'RATED') {
        try {
          const ratingData = await ratingsApi.getMyRating(bookingId);
          setMyRating(ratingData);
        } catch {
          // Ignore rating check errors
        }
        try {
          const reportData = await reportsApi.getMyReport(bookingId);
          setHasReported(reportData.reported);
        } catch {
          // Ignore
        }
      }

      // Load provider location for active bookings
      const trackableStatuses = ['ACCEPTED', 'PROVIDER_ARRIVING', 'IN_PROGRESS'];
      if (trackableStatuses.includes(data.status)) {
        try {
          const loc = await safetyApi.getProviderLocation(bookingId);
          setProviderLocation(loc);
        } catch {
          // Ignore
        }
      }
    } catch (err) {
      console.error('Failed to load booking:', err);
      setError('No se pudo cargar la solicitud');
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (isAuthenticated && bookingId) {
      loadBooking();
    }
  }, [isAuthenticated, bookingId, loadBooking]);

  // Poll for updates every 5 seconds for active bookings
  useEffect(() => {
    if (!booking) return;
    const activeStatuses: BookingStatus[] = [
      'PENDING',
      'ACCEPTED',
      'PROVIDER_ARRIVING',
      'IN_PROGRESS',
    ];

    if (activeStatuses.includes(booking.status)) {
      pollRef.current = setInterval(() => {
        bookingsApi.getById(bookingId).then(setBooking).catch(() => {});
      }, 5000);
    }

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [booking?.status, bookingId]);

  // Poll provider location for active bookings
  useEffect(() => {
    if (!booking) return;
    const trackable = ['ACCEPTED', 'PROVIDER_ARRIVING', 'IN_PROGRESS'];
    if (!trackable.includes(booking.status)) return;

    const interval = setInterval(async () => {
      try {
        const loc = await safetyApi.getProviderLocation(bookingId);
        setProviderLocation(loc);
      } catch {
        // Ignore
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [booking?.status, bookingId]);

  const handleCancel = async () => {
    if (!booking) return;
    setCancelling(true);
    try {
      const updated = await bookingsApi.cancel(booking.id);
      setBooking(updated);
      setShowCancelConfirm(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'No se pudo cancelar';
      setError(message);
    } finally {
      setCancelling(false);
    }
  };

  const handleReport = async () => {
    if (!reportForm.category || !reportForm.description) return;
    setSubmittingReport(true);
    try {
      await reportsApi.create(bookingId, {
        category: reportForm.category,
        description: reportForm.description,
        isSafety: ['SAFETY', 'HARASSMENT', 'THEFT'].includes(reportForm.category),
      });
      setHasReported(true);
      setShowReportModal(false);
      setReportForm({ category: '', description: '' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'No se pudo enviar el reporte';
      setError(message);
    } finally {
      setSubmittingReport(false);
    }
  };

  const handleSos = async () => {
    try {
      let lat: number | undefined;
      let lng: number | undefined;
      if (navigator.geolocation) {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
        }).catch(() => null);
        if (pos) {
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        }
      }
      await safetyApi.triggerSos({ bookingId, lat, lng });
      setSosTriggered(true);
      setShowSosConfirm(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al enviar SOS';
      setError(message);
    }
  };

  if (authLoading || !isAuthenticated) return null;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Cargando solicitud...</p>
        </div>
      </div>
    );
  }

  if (error && !booking) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
        <span className="text-5xl mb-4">😕</span>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">{error}</h2>
        <button onClick={() => router.back()} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium mt-4">
          ← Volver
        </button>
      </div>
    );
  }

  if (!booking) return null;

  const statusConfig = STATUS_CONFIG[booking.status];
  const isCancellable = booking.status === 'PENDING' || booking.status === 'ACCEPTED';
  const isTerminal = ['COMPLETED', 'RATED', 'CANCELLED', 'REJECTED'].includes(booking.status);

  // Current step index in timeline
  const currentTimelineIdx = TIMELINE_STEPS.indexOf(booking.status);

  return (
    <div className="min-h-screen bg-gray-50 pb-6">
      {/* Header */}
      <header className="bg-white px-5 pt-12 pb-5 border-b border-gray-100">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => router.push('/bookings')}
            className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
          >
            ←
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-gray-800">Seguimiento</h1>
            <p className="text-xs text-gray-400">
              #{booking.id.slice(0, 8).toUpperCase()}
            </p>
          </div>
        </div>

        {/* Status badge */}
        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${statusConfig.color}`}>
          <span>{statusConfig.icon}</span>
          <span>{statusConfig.label}</span>
        </div>
        <p className="text-sm text-gray-500 mt-2">{statusConfig.description}</p>
      </header>

      <div className="px-5 py-5 space-y-5">
        {/* Timeline */}
        {!isTerminal || booking.status === 'COMPLETED' || booking.status === 'RATED' ? (
          <section className="bg-white rounded-2xl p-5 border border-gray-100">
            <h2 className="text-sm font-semibold text-gray-800 mb-4">Progreso</h2>
            <div className="space-y-0">
              {TIMELINE_STEPS.map((stepStatus, idx) => {
                const stepConfig = STATUS_CONFIG[stepStatus];
                const isCompleted = currentTimelineIdx >= idx;
                const isCurrent = currentTimelineIdx === idx;
                const isLast = idx === TIMELINE_STEPS.length - 1;

                return (
                  <div key={stepStatus} className="flex gap-3">
                    {/* Dot and line */}
                    <div className="flex flex-col items-center">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 transition-all ${
                          isCurrent
                            ? 'bg-indigo-600 text-white ring-4 ring-indigo-100'
                            : isCompleted
                              ? 'bg-indigo-600 text-white'
                              : 'bg-gray-100 text-gray-400'
                        }`}
                      >
                        {isCompleted && !isCurrent ? '✓' : stepConfig.icon}
                      </div>
                      {!isLast && (
                        <div
                          className={`w-0.5 h-8 transition-colors ${
                            isCompleted && idx < currentTimelineIdx
                              ? 'bg-indigo-600'
                              : 'bg-gray-200'
                          }`}
                        />
                      )}
                    </div>
                    {/* Label */}
                    <div className={`pt-1.5 ${!isLast ? 'pb-4' : ''}`}>
                      <p
                        className={`text-sm font-medium ${
                          isCompleted ? 'text-gray-800' : 'text-gray-400'
                        }`}
                      >
                        {stepConfig.label}
                      </p>
                      {isCurrent && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {stepConfig.description}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : (
          /* Terminal status card for cancelled/rejected */
          <section className={`rounded-2xl p-5 ${statusConfig.color} border border-current/10`}>
            <div className="text-center">
              <span className="text-4xl block mb-2">{statusConfig.icon}</span>
              <h3 className="text-lg font-bold">{statusConfig.label}</h3>
              <p className="text-sm opacity-75 mt-1">{statusConfig.description}</p>
              {booking.cancelReason && (
                <p className="text-sm mt-2 opacity-60">
                  Motivo: {booking.cancelReason}
                </p>
              )}
            </div>
          </section>
        )}

        {/* Provider info */}
        {booking.provider && (
          <section className="bg-white rounded-2xl p-4 border border-gray-100">
            <h2 className="text-sm font-semibold text-gray-800 mb-3">Proveedor</h2>
            <div className="flex items-center gap-3">
              {booking.provider.avatarUrl ? (
                <img
                  src={booking.provider.avatarUrl}
                  alt=""
                  className="w-12 h-12 rounded-full object-cover bg-gray-100"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-bold text-lg">
                  {(booking.provider.name || '?')[0]}
                </div>
              )}
              <div className="flex-1">
                <p className="font-semibold text-gray-800">{booking.provider.name}</p>
                {booking.provider.ratingAverage !== undefined && (
                  <p className="text-xs text-gray-500">
                    ⭐ {booking.provider.ratingAverage?.toFixed(1)} · {booking.provider.ratingCount} reseñas
                  </p>
                )}
              </div>
              <button
                onClick={() => router.push(`/providers/${booking.provider!.id}`)}
                className="px-3 py-1.5 bg-gray-100 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-200 transition-colors"
              >
                Ver perfil
              </button>
            </div>
          </section>
        )}

        {/* Booking details */}
        <section className="bg-white rounded-2xl p-4 border border-gray-100">
          <h2 className="text-sm font-semibold text-gray-800 mb-3">Detalles</h2>
          <div className="space-y-3">
            {booking.category && (
              <DetailRow
                icon={booking.category.icon}
                label="Servicio"
                value={booking.category.name}
              />
            )}
            <DetailRow icon="📝" label="Descripción" value={booking.description} />
            {booking.address && (
              <DetailRow icon="📍" label="Dirección" value={booking.address} />
            )}
            <DetailRow
              icon="📅"
              label="Solicitado"
              value={new Date(booking.createdAt).toLocaleString('es-MX', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            />
            {booking.scheduledAt && (
              <DetailRow
                icon="🕐"
                label="Programado"
                value={new Date(booking.scheduledAt).toLocaleString('es-MX', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              />
            )}
            {booking.completedAt && (
              <DetailRow
                icon="✅"
                label="Completado"
                value={new Date(booking.completedAt).toLocaleString('es-MX', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              />
            )}
          </div>
        </section>

        {/* Provider GPS Location */}
        {providerLocation?.available && (
          <section className="bg-white rounded-2xl p-4 border border-gray-100">
            <h2 className="text-sm font-semibold text-gray-800 mb-3">
              Ubicación del proveedor
            </h2>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-lg">
                📍
              </div>
              <div className="flex-1">
                <p className="text-sm text-gray-700">
                  Última actualización:{' '}
                  {providerLocation.updatedAt
                    ? new Date(providerLocation.updatedAt).toLocaleTimeString('es-MX', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Ahora'}
                </p>
              </div>
              <a
                href={`https://maps.google.com/?q=${providerLocation.lat},${providerLocation.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium"
              >
                Ver en mapa
              </a>
            </div>
          </section>
        )}

        {/* Action buttons */}
        {!isTerminal && (
          <div className="space-y-3">
            {/* Chat button */}
            <button
              className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold text-sm active:scale-95 transition-transform"
              onClick={() => router.push(`/chat/${booking.id}`)}
            >
              💬 Chatear con {booking.provider?.name || 'proveedor'}
            </button>

            {/* Cancel button */}
            {isCancellable && (
              <button
                onClick={() => setShowCancelConfirm(true)}
                className="w-full py-3 bg-white border border-red-200 text-red-600 rounded-xl font-semibold text-sm hover:bg-red-50 transition-colors"
              >
                Cancelar solicitud
              </button>
            )}

            {/* SOS Button — only during active service */}
            {['ACCEPTED', 'PROVIDER_ARRIVING', 'IN_PROGRESS'].includes(booking.status) && (
              <button
                onClick={() => sosTriggered ? null : setShowSosConfirm(true)}
                disabled={sosTriggered}
                className={`w-full py-3 rounded-xl font-semibold text-sm ${
                  sosTriggered
                    ? 'bg-orange-100 text-orange-600'
                    : 'bg-red-600 text-white active:scale-95 transition-transform'
                }`}
              >
                {sosTriggered ? 'Alerta SOS enviada' : '🆘 Botón de emergencia'}
              </button>
            )}
          </div>
        )}

        {/* Rating CTA for completed bookings */}
        {(booking.status === 'COMPLETED' || booking.status === 'RATED') && (
          <section className="bg-white rounded-2xl p-5 border border-gray-100">
            {myRating?.rated && myRating.rating ? (
              /* Show existing rating */
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-800 mb-2">Tu calificación</p>
                <div className="flex items-center justify-center gap-1 mb-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <span
                      key={i}
                      className={`text-2xl ${i <= myRating.rating!.score ? 'text-yellow-400' : 'text-gray-200'}`}
                    >
                      ★
                    </span>
                  ))}
                </div>
                {myRating.rating.comment && (
                  <p className="text-xs text-gray-500 italic">
                    &ldquo;{myRating.rating.comment}&rdquo;
                  </p>
                )}
              </div>
            ) : (
              /* Show rate CTA */
              <div className="text-center">
                <span className="text-4xl block mb-2">⭐</span>
                <h3 className="text-base font-bold text-gray-800 mb-1">
                  ¿Cómo estuvo el servicio?
                </h3>
                <p className="text-xs text-gray-500 mb-4">
                  Tu opinión ayuda a otros clientes y motiva a los proveedores.
                </p>
                <button
                  onClick={() => router.push(`/bookings/${booking.id}/rate`)}
                  className="w-full py-3 bg-gradient-to-r from-yellow-400 to-orange-500 text-white rounded-xl font-semibold text-sm shadow-lg shadow-yellow-200 active:scale-95 transition-transform"
                >
                  ⭐ Calificar a {booking.provider?.name || 'proveedor'}
                </button>
              </div>
            )}
          </section>
        )}

        {/* Report button for completed bookings */}
        {(booking.status === 'COMPLETED' || booking.status === 'RATED' || booking.status === 'IN_PROGRESS') && (
          <section className="bg-white rounded-2xl p-4 border border-gray-100">
            {hasReported ? (
              <div className="text-center py-2">
                <p className="text-sm text-gray-500">Ya reportaste este servicio</p>
              </div>
            ) : (
              <button
                onClick={() => setShowReportModal(true)}
                className="w-full py-3 bg-gray-50 border border-gray-200 text-gray-600 rounded-xl font-medium text-sm hover:bg-gray-100 transition-colors"
              >
                Reportar un problema
              </button>
            )}
          </section>
        )}

        {/* Back to bookings */}
        {isTerminal && (
          <button
            onClick={() => router.push('/bookings')}
            className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-colors"
          >
            ← Ver todas mis solicitudes
          </button>
        )}
      </div>

      {/* SOS confirmation modal */}
      {showSosConfirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
          <div className="w-full max-w-[480px] bg-white rounded-t-3xl p-6 pb-8 safe-bottom animate-in slide-in-from-bottom">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
            <div className="text-center mb-6">
              <span className="text-5xl block mb-3">🆘</span>
              <h3 className="text-lg font-bold text-gray-800 mb-2">Alerta de emergencia</h3>
              <p className="text-sm text-gray-500">
                Se notificará a tus contactos de emergencia con tu ubicación actual.
                Usa esto solo en caso de una emergencia real.
              </p>
            </div>
            <div className="space-y-3">
              <button
                onClick={handleSos}
                className="w-full py-3.5 bg-red-600 text-white rounded-xl font-semibold text-sm"
              >
                Enviar alerta SOS
              </button>
              <button
                onClick={() => setShowSosConfirm(false)}
                className="w-full py-3.5 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
          <div className="w-full max-w-[480px] bg-white rounded-t-3xl p-6 pb-8 safe-bottom animate-in slide-in-from-bottom max-h-[80vh] overflow-y-auto">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
            <h3 className="text-lg font-bold text-gray-800 mb-4">
              Reportar un problema
            </h3>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">
                  Categoría del problema
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'NO_SHOW', label: 'No se presentó' },
                    { value: 'POOR_QUALITY', label: 'Mala calidad' },
                    { value: 'OVERCHARGE', label: 'Cobro excesivo' },
                    { value: 'DAMAGE', label: 'Daño a propiedad' },
                    { value: 'THEFT', label: 'Robo' },
                    { value: 'HARASSMENT', label: 'Acoso' },
                    { value: 'SAFETY', label: 'Seguridad' },
                    { value: 'OTHER', label: 'Otro' },
                  ].map((cat) => (
                    <button
                      key={cat.value}
                      onClick={() => setReportForm((f) => ({ ...f, category: cat.value }))}
                      className={`py-2 px-3 rounded-lg text-xs font-medium border transition-colors ${
                        reportForm.category === cat.value
                          ? 'bg-red-50 border-red-300 text-red-700'
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">
                  Describe el problema
                </label>
                <textarea
                  value={reportForm.description}
                  onChange={(e) => setReportForm((f) => ({ ...f, description: e.target.value }))}
                  rows={4}
                  placeholder="Cuéntanos qué pasó..."
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 resize-none"
                />
              </div>

              {['THEFT', 'HARASSMENT', 'SAFETY'].includes(reportForm.category) && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-xl">
                  <p className="text-xs text-red-700 font-medium">
                    Este es un reporte de seguridad. Será revisado con prioridad por nuestro equipo.
                  </p>
                </div>
              )}

              <div className="space-y-3 pt-2">
                <button
                  onClick={handleReport}
                  disabled={!reportForm.category || !reportForm.description || submittingReport}
                  className="w-full py-3.5 bg-red-600 text-white rounded-xl font-semibold text-sm disabled:opacity-50"
                >
                  {submittingReport ? 'Enviando...' : 'Enviar reporte'}
                </button>
                <button
                  onClick={() => setShowReportModal(false)}
                  className="w-full py-3.5 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancel confirmation modal */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
          <div className="w-full max-w-[480px] bg-white rounded-t-3xl p-6 pb-8 safe-bottom animate-in slide-in-from-bottom">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
            <h3 className="text-lg font-bold text-gray-800 text-center mb-2">
              ¿Cancelar solicitud?
            </h3>
            <p className="text-sm text-gray-500 text-center mb-6">
              Esta acción no se puede deshacer. El proveedor será notificado.
            </p>
            <div className="space-y-3">
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="w-full py-3.5 bg-red-600 text-white rounded-xl font-semibold text-sm disabled:opacity-50"
              >
                {cancelling ? 'Cancelando...' : 'Sí, cancelar solicitud'}
              </button>
              <button
                onClick={() => setShowCancelConfirm(false)}
                className="w-full py-3.5 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm"
              >
                No, mantener
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-base shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">
          {label}
        </p>
        <p className="text-sm text-gray-700">{value}</p>
      </div>
    </div>
  );
}


