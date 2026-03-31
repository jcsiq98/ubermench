'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  adminApi,
  type ProviderApplication,
  type ApplicationListResponse,
} from '../../../lib/api';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800' },
  DOCS_SUBMITTED: { label: 'Docs recibidos', color: 'bg-blue-100 text-blue-800' },
  APPROVED: { label: 'Aprobada', color: 'bg-green-100 text-green-800' },
  REJECTED: { label: 'Rechazada', color: 'bg-red-100 text-red-800' },
};

const CATEGORY_NAMES: Record<string, string> = {
  plumbing: 'Plomería',
  electrical: 'Electricidad',
  cleaning: 'Limpieza',
  gardening: 'Jardinería',
  painting: 'Pintura',
  locksmith: 'Cerrajería',
  repair: 'Reparaciones',
  moving: 'Mudanzas',
};

export default function ApplicationsPage() {
  const [applications, setApplications] = useState<ProviderApplication[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('');
  const [selectedApp, setSelectedApp] = useState<ProviderApplication | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [tierSelect, setTierSelect] = useState(1);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res: ApplicationListResponse = await adminApi.getApplications({
        status: filter || undefined,
        limit: 50,
      });
      setApplications(res.data);
      setTotal(res.total);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleApprove(id: string) {
    if (actionLoading) return;
    try {
      setActionLoading(true);
      await adminApi.approveApplication(id, tierSelect);
      setSelectedApp(null);
      await load();
    } catch (err: any) {
      alert(err.message || 'Error al aprobar');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReject(id: string) {
    if (actionLoading || !rejectReason.trim()) return;
    try {
      setActionLoading(true);
      await adminApi.rejectApplication(id, rejectReason);
      setSelectedApp(null);
      setShowRejectModal(false);
      setRejectReason('');
      await load();
    } catch (err: any) {
      alert(err.message || 'Error al rechazar');
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Solicitudes</h1>
        <span className="text-sm text-gray-500">{total} total</span>
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { value: '', label: 'Todas' },
          { value: 'PENDING', label: 'Pendientes' },
          { value: 'DOCS_SUBMITTED', label: 'Con docs' },
          { value: 'APPROVED', label: 'Aprobadas' },
          { value: 'REJECTED', label: 'Rechazadas' },
        ].map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              filter === f.value
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-600 border hover:bg-gray-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-4 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-40 mb-2" />
              <div className="h-4 bg-gray-200 rounded w-28" />
            </div>
          ))}
        </div>
      ) : applications.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-4xl mb-2">📋</p>
          <p>No hay solicitudes</p>
        </div>
      ) : (
        <div className="space-y-3">
          {applications.map((app) => (
            <button
              key={app.id}
              onClick={() => setSelectedApp(app)}
              className="w-full bg-white rounded-xl p-4 text-left hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between mb-2">
                <p className="font-semibold text-gray-900">{app.name || 'Sin nombre'}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_LABELS[app.verificationStatus]?.color || 'bg-gray-100 text-gray-600'}`}>
                  {STATUS_LABELS[app.verificationStatus]?.label || app.verificationStatus}
                </span>
              </div>
              <p className="text-sm text-gray-500">{app.phone}</p>
              <p className="text-xs text-gray-400 mt-1">
                {app.categories.map((c) => CATEGORY_NAMES[c] || c).join(', ')}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {new Date(app.createdAt).toLocaleDateString('es-MX', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Detail modal */}
      {selectedApp && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={() => setSelectedApp(null)}>
          <div
            className="bg-white rounded-t-2xl w-full max-w-[480px] max-h-[90vh] overflow-y-auto p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Detalle de solicitud</h2>
              <button onClick={() => setSelectedApp(null)} className="text-gray-400 text-xl">&times;</button>
            </div>

            {/* Info */}
            <div className="space-y-3 mb-4">
              <InfoRow label="Nombre" value={selectedApp.name || '—'} />
              <InfoRow label="Teléfono" value={selectedApp.phone} />
              <InfoRow label="Experiencia" value={`${selectedApp.yearsExperience} años`} />
              <InfoRow label="Servicios" value={selectedApp.categories.map((c) => CATEGORY_NAMES[c] || c).join(', ')} />
              <InfoRow label="Zonas" value={selectedApp.serviceZones.join(', ')} />
              <InfoRow label="Bio" value={selectedApp.bio || '(sin descripción)'} />
              <InfoRow label="Status" value={STATUS_LABELS[selectedApp.verificationStatus]?.label || selectedApp.verificationStatus} />
              {selectedApp.rejectionReason && (
                <InfoRow label="Motivo rechazo" value={selectedApp.rejectionReason} />
              )}
            </div>

            {/* Photos */}
            {(selectedApp.inePhotoFront || selectedApp.inePhotoBack || selectedApp.selfiePhoto) && (
              <div className="mb-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Documentos</p>
                <div className="grid grid-cols-3 gap-2">
                  {selectedApp.inePhotoFront && (
                    <div>
                      <p className="text-[10px] text-gray-500 mb-1">INE Frente</p>
                      <img
                        src={selectedApp.inePhotoFront}
                        alt="INE Frente"
                        className="w-full h-24 object-cover rounded-lg border"
                      />
                    </div>
                  )}
                  {selectedApp.inePhotoBack && (
                    <div>
                      <p className="text-[10px] text-gray-500 mb-1">INE Reverso</p>
                      <img
                        src={selectedApp.inePhotoBack}
                        alt="INE Reverso"
                        className="w-full h-24 object-cover rounded-lg border"
                      />
                    </div>
                  )}
                  {selectedApp.selfiePhoto && (
                    <div>
                      <p className="text-[10px] text-gray-500 mb-1">Selfie</p>
                      <img
                        src={selectedApp.selfiePhoto}
                        alt="Selfie"
                        className="w-full h-24 object-cover rounded-lg border"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Actions */}
            {(selectedApp.verificationStatus === 'PENDING' ||
              selectedApp.verificationStatus === 'DOCS_SUBMITTED') && (
              <div className="space-y-3 pt-3 border-t">
                {/* Approve */}
                <div className="flex items-center gap-2">
                  <select
                    value={tierSelect}
                    onChange={(e) => setTierSelect(Number(e.target.value))}
                    className="flex-1 border rounded-lg px-3 py-2 text-sm"
                  >
                    <option value={1}>Tier 1 — Basic</option>
                    <option value={2}>Tier 2 — Verified</option>
                    <option value={3}>Tier 3 — Pro</option>
                    <option value={4}>Tier 4 — Elite</option>
                  </select>
                  <button
                    onClick={() => handleApprove(selectedApp.id)}
                    disabled={actionLoading}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                  >
                    {actionLoading ? '...' : '✅ Aprobar'}
                  </button>
                </div>
                {/* Reject */}
                <button
                  onClick={() => setShowRejectModal(true)}
                  className="w-full bg-red-50 text-red-600 py-2 rounded-lg text-sm font-medium hover:bg-red-100"
                >
                  ❌ Rechazar
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reject reason modal */}
      {showRejectModal && selectedApp && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => setShowRejectModal(false)}>
          <div className="bg-white rounded-xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-gray-900 mb-3">Motivo de rechazo</h3>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Describe el motivo del rechazo..."
              className="w-full border rounded-lg p-3 text-sm resize-none h-24"
            />
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setShowRejectModal(false)}
                className="flex-1 py-2 border rounded-lg text-sm font-medium text-gray-600"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleReject(selectedApp.id)}
                disabled={actionLoading || !rejectReason.trim()}
                className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {actionLoading ? '...' : 'Confirmar rechazo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm text-gray-900">{value}</p>
    </div>
  );
}
