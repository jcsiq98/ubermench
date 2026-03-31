'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { providerApi, type BookingSummary } from '../../../lib/api';

type Tab = 'pending' | 'active' | 'completed' | 'rejected';

export default function ProviderJobsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('pending');
  const [jobs, setJobs] = useState<BookingSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<BookingSummary | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await providerApi.getJobs({ filter: tab, limit: 50 });
      setJobs(res.data);
      setTotal(res.total);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  const handleAction = async (jobId: string, action: 'accept' | 'reject' | 'arriving' | 'start' | 'complete') => {
    setActionLoading(jobId);
    try {
      if (action === 'accept') await providerApi.acceptJob(jobId);
      else if (action === 'reject') await providerApi.rejectJob(jobId);
      else await providerApi.updateJobStatus(jobId, action);
      await loadJobs();
      setSelectedJob(null);
    } catch {
      /* ignore */
    } finally {
      setActionLoading(null);
    }
  };

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'pending', label: 'Pendientes', icon: '🟡' },
    { key: 'active', label: 'Activos', icon: '🟢' },
    { key: 'completed', label: 'Completados', icon: '✅' },
    { key: 'rejected', label: 'Rechazados', icon: '❌' },
  ];

  return (
    <div className="px-5 py-5">
      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-5">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setSelectedJob(null); }}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
              tab === t.key
                ? 'bg-white text-gray-800 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-8 h-8 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-12">
          <span className="text-4xl">📋</span>
          <p className="text-sm text-gray-500 mt-3">Sin trabajos en esta categoría</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-gray-400">{total} trabajo{total !== 1 ? 's' : ''}</p>
          {jobs.map((job) => (
            <div key={job.id}>
              <button
                onClick={() => setSelectedJob(selectedJob?.id === job.id ? null : job)}
                className="w-full bg-white rounded-2xl p-4 shadow-sm text-left hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-800 truncate">
                      {job.category?.icon} {job.category?.name}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{job.description}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-xs text-gray-400">
                        👤 {job.customer?.name || 'Cliente'}
                      </span>
                      <span className="text-xs text-gray-300">·</span>
                      <span className="text-xs text-gray-400">
                        {new Date(job.createdAt).toLocaleDateString('es-MX')}
                      </span>
                    </div>
                  </div>
                  <span className="text-gray-300 ml-2">{selectedJob?.id === job.id ? '▲' : '▼'}</span>
                </div>
              </button>

              {/* Expanded detail */}
              {selectedJob?.id === job.id && (
                <div className="bg-white rounded-b-2xl px-4 pb-4 -mt-2 shadow-sm space-y-3">
                  <div className="border-t border-gray-100 pt-3">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-gray-400">Descripción</p>
                        <p className="text-gray-800">{job.description}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Dirección</p>
                        <p className="text-gray-800">{job.address || 'Sin dirección'}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Fecha</p>
                        <p className="text-gray-800">
                          {job.scheduledAt
                            ? new Date(job.scheduledAt).toLocaleString('es-MX')
                            : 'Lo antes posible'}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-400">Estado</p>
                        <p className="text-gray-800 font-medium">{job.status}</p>
                      </div>
                    </div>

                    {/* Map link + Chat link */}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {job.locationLat && job.locationLng && (
                        <a
                          href={`https://maps.google.com/?q=${job.locationLat},${job.locationLng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-600 rounded-lg text-xs font-medium"
                        >
                          📍 Google Maps
                        </a>
                      )}
                      {['ACCEPTED', 'PROVIDER_ARRIVING', 'IN_PROGRESS'].includes(job.status) && (
                        <button
                          onClick={() => router.push(`/bookings/${job.id}`)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-medium"
                        >
                          💬 Chat con cliente
                        </button>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2 mt-3">
                      {job.status === 'PENDING' && (
                        <>
                          <button
                            onClick={() => handleAction(job.id, 'accept')}
                            disabled={actionLoading === job.id}
                            className="flex-1 py-2.5 bg-green-500 text-white rounded-xl text-xs font-semibold disabled:opacity-50"
                          >
                            ✅ Aceptar
                          </button>
                          <button
                            onClick={() => handleAction(job.id, 'reject')}
                            disabled={actionLoading === job.id}
                            className="flex-1 py-2.5 bg-red-100 text-red-600 rounded-xl text-xs font-semibold disabled:opacity-50"
                          >
                            ❌ Rechazar
                          </button>
                        </>
                      )}
                      {job.status === 'ACCEPTED' && (
                        <button
                          onClick={() => handleAction(job.id, 'arriving')}
                          disabled={actionLoading === job.id}
                          className="flex-1 py-2.5 bg-purple-500 text-white rounded-xl text-xs font-semibold disabled:opacity-50"
                        >
                          🚗 En camino
                        </button>
                      )}
                      {(job.status === 'ACCEPTED' || job.status === 'PROVIDER_ARRIVING') && (
                        <button
                          onClick={() => handleAction(job.id, 'start')}
                          disabled={actionLoading === job.id}
                          className="flex-1 py-2.5 bg-indigo-500 text-white rounded-xl text-xs font-semibold disabled:opacity-50"
                        >
                          🔧 Empezar
                        </button>
                      )}
                      {job.status === 'IN_PROGRESS' && (
                        <button
                          onClick={() => handleAction(job.id, 'complete')}
                          disabled={actionLoading === job.id}
                          className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-xs font-semibold disabled:opacity-50"
                        >
                          ✅ Completar
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
