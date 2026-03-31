'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { providerApi, type ProviderDashboardData, type BookingSummary } from '../../lib/api';

export default function ProviderDashboard() {
  const router = useRouter();
  const [data, setData] = useState<ProviderDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    providerApi.getDashboard()
      .then(setData)
      .catch((err) => setError(err.message || 'Error loading dashboard'))
      .finally(() => setLoading(false));
  }, []);

  const handleAccept = async (jobId: string) => {
    try {
      await providerApi.acceptJob(jobId);
      const updated = await providerApi.getDashboard();
      setData(updated);
    } catch (err: any) {
      setError(err.message || 'Error accepting job');
    }
  };

  const handleReject = async (jobId: string) => {
    try {
      await providerApi.rejectJob(jobId);
      const updated = await providerApi.getDashboard();
      setData(updated);
    } catch (err: any) {
      setError(err.message || 'Error rejecting job');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-5 text-center">
        <p className="text-red-500 text-sm">{error || 'No se encontró el perfil de proveedor'}</p>
        <button onClick={() => router.push('/')} className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm">
          Ir al inicio
        </button>
      </div>
    );
  }

  return (
    <div className="px-5 py-5 space-y-5">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3">
        <KPICard icon="🔧" label="Trabajos completados" value={String(data.stats.totalJobs)} />
        <KPICard icon="📅" label="Este mes" value={String(data.stats.monthJobs)} />
        <KPICard icon="⭐" label="Rating" value={`${data.stats.ratingAverage.toFixed(1)} (${data.stats.ratingCount})`} />
        <KPICard icon="📊" label="Esta semana" value={String(data.stats.weekJobs)} />
      </div>

      {/* Weekly chart (simple bar) */}
      {data.weeklyBreakdown.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Últimas 4 semanas</h3>
          <div className="flex items-end justify-between gap-2 h-24">
            {data.weeklyBreakdown.map((w, i) => {
              const max = Math.max(...data.weeklyBreakdown.map((ww) => ww.jobs), 1);
              const height = (w.jobs / max) * 100;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs text-gray-500 font-medium">{w.jobs}</span>
                  <div
                    className="w-full bg-gradient-to-t from-indigo-500 to-purple-500 rounded-t-lg transition-all"
                    style={{ height: `${Math.max(height, 4)}%` }}
                  />
                  <span className="text-[10px] text-gray-400">
                    S{i + 1}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pending Jobs */}
      {data.pendingJobs.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-800 mb-3">🔔 Trabajos pendientes</h3>
          <div className="space-y-3">
            {data.pendingJobs.map((job: BookingSummary) => (
              <div key={job.id} className="bg-white rounded-2xl p-4 shadow-sm border-l-4 border-amber-400">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">
                      {job.category?.icon} {job.category?.name}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{job.description?.slice(0, 60)}...</p>
                    <p className="text-xs text-gray-400 mt-1">
                      👤 {job.customer?.name} · 📍 {job.address?.slice(0, 30) || 'Sin dirección'}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => handleAccept(job.id)}
                    className="flex-1 py-2 bg-green-500 text-white rounded-xl text-xs font-semibold hover:bg-green-600 transition-colors"
                  >
                    ✅ Aceptar
                  </button>
                  <button
                    onClick={() => handleReject(job.id)}
                    className="flex-1 py-2 bg-red-100 text-red-600 rounded-xl text-xs font-semibold hover:bg-red-200 transition-colors"
                  >
                    ❌ Rechazar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Jobs */}
      {data.activeJobs.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-800 mb-3">🔧 Trabajos activos</h3>
          <div className="space-y-3">
            {data.activeJobs.map((job: BookingSummary) => (
              <button
                key={job.id}
                onClick={() => router.push(`/provider/jobs?detail=${job.id}`)}
                className="w-full bg-white rounded-2xl p-4 shadow-sm border-l-4 border-green-400 text-left"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">
                      {job.category?.icon} {job.category?.name}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      👤 {job.customer?.name}
                    </p>
                  </div>
                  <StatusBadge status={job.status} />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {data.pendingJobs.length === 0 && data.activeJobs.length === 0 && (
        <div className="text-center py-8">
          <span className="text-4xl">🔔</span>
          <p className="text-sm text-gray-500 mt-3">No hay trabajos pendientes por ahora</p>
          <p className="text-xs text-gray-400 mt-1">Te notificaremos cuando llegue una solicitud</p>
        </div>
      )}
    </div>
  );
}

function KPICard({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <span className="text-xl">{icon}</span>
      <p className="text-xl font-bold text-gray-800 mt-1">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    PENDING: 'bg-amber-100 text-amber-700',
    ACCEPTED: 'bg-blue-100 text-blue-700',
    PROVIDER_ARRIVING: 'bg-purple-100 text-purple-700',
    IN_PROGRESS: 'bg-green-100 text-green-700',
    COMPLETED: 'bg-gray-100 text-gray-700',
  };
  const labels: Record<string, string> = {
    PENDING: 'Pendiente',
    ACCEPTED: 'Aceptado',
    PROVIDER_ARRIVING: 'En camino',
    IN_PROGRESS: 'En progreso',
    COMPLETED: 'Completado',
  };
  return (
    <span className={`px-2 py-1 rounded-lg text-[10px] font-semibold ${styles[status] || 'bg-gray-100 text-gray-600'}`}>
      {labels[status] || status}
    </span>
  );
}
