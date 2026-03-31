'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminReportsApi, type Report, type ReportListResponse } from '../../../lib/api';

const REPORT_CATEGORIES: Record<string, string> = {
  NO_SHOW: 'No se presentó',
  POOR_QUALITY: 'Mala calidad',
  OVERCHARGE: 'Cobro excesivo',
  DAMAGE: 'Daño a propiedad',
  THEFT: 'Robo',
  HARASSMENT: 'Acoso',
  SAFETY: 'Seguridad',
  FRAUD: 'Fraude',
  OTHER: 'Otro',
};

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-yellow-100 text-yellow-800',
  UNDER_REVIEW: 'bg-blue-100 text-blue-800',
  RESOLVED: 'bg-green-100 text-green-800',
  DISMISSED: 'bg-gray-100 text-gray-600',
};

export default function AdminReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [resolution, setResolution] = useState('');
  const [resolving, setResolving] = useState(false);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const data: ReportListResponse = await adminReportsApi.getReports({
        status: statusFilter || undefined,
        limit: 50,
      });
      setReports(data.data);
      setTotal(data.total);
    } catch (err) {
      console.error('Failed to load reports:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handleResolve = async (action: 'resolve' | 'dismiss') => {
    if (!selectedReport || !resolution.trim()) return;
    setResolving(true);
    try {
      await adminReportsApi.resolveReport(selectedReport.id, resolution, action);
      setSelectedReport(null);
      setResolution('');
      loadReports();
    } catch (err) {
      console.error('Failed to resolve:', err);
    } finally {
      setResolving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Reportes</h1>
          <p className="text-sm text-gray-500">{total} reportes</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        {['', 'OPEN', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED'].map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              statusFilter === status
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-600 border hover:bg-gray-50'
            }`}
          >
            {status === '' ? 'Todos' : status === 'OPEN' ? 'Abiertos' : status === 'UNDER_REVIEW' ? 'En revisión' : status === 'RESOLVED' ? 'Resueltos' : 'Descartados'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto" />
        </div>
      ) : reports.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <span className="text-4xl block mb-2">📋</span>
          <p>No hay reportes</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <div
              key={report.id}
              onClick={() => setSelectedReport(report)}
              className={`bg-white rounded-xl p-4 border cursor-pointer hover:shadow-sm transition-shadow ${
                report.isSafety ? 'border-red-200' : 'border-gray-100'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  {report.isSafety && <span className="text-red-500 text-sm">🚨</span>}
                  <span className="font-medium text-sm text-gray-800">
                    {REPORT_CATEGORIES[report.category] || report.category}
                  </span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[report.status] || 'bg-gray-100'}`}>
                  {report.status}
                </span>
              </div>

              <p className="text-sm text-gray-600 line-clamp-2 mb-2">
                {report.description}
              </p>

              <div className="flex items-center gap-4 text-xs text-gray-400">
                <span>
                  Por: {report.reporter?.name || 'Anónimo'}
                </span>
                <span>
                  Contra: {report.reported?.name || 'Desconocido'}
                </span>
                <span>
                  {new Date(report.createdAt).toLocaleDateString('es-MX')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Report detail modal */}
      {selectedReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Detalle del reporte</h3>
              <button
                onClick={() => { setSelectedReport(null); setResolution(''); }}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-400 font-medium">Categoría</p>
                  <p className="text-sm text-gray-800 font-medium">
                    {REPORT_CATEGORIES[selectedReport.category]}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-medium">Estado</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[selectedReport.status]}`}>
                    {selectedReport.status}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-medium">Reportado por</p>
                  <p className="text-sm text-gray-800">
                    {selectedReport.reporter?.name || 'Anónimo'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-medium">Reportado</p>
                  <p className="text-sm text-gray-800">
                    {selectedReport.reported?.name || 'Desconocido'}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-xs text-gray-400 font-medium mb-1">Descripción</p>
                <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg">
                  {selectedReport.description}
                </p>
              </div>

              {selectedReport.resolution && (
                <div>
                  <p className="text-xs text-gray-400 font-medium mb-1">Resolución</p>
                  <p className="text-sm text-gray-700 bg-green-50 p-3 rounded-lg">
                    {selectedReport.resolution}
                  </p>
                </div>
              )}

              {selectedReport.status === 'OPEN' || selectedReport.status === 'UNDER_REVIEW' ? (
                <div className="border-t pt-4">
                  <label className="text-sm font-medium text-gray-700 block mb-2">
                    Resolución
                  </label>
                  <textarea
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                    rows={3}
                    placeholder="Describe la resolución..."
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none"
                  />
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => handleResolve('resolve')}
                      disabled={!resolution.trim() || resolving}
                      className="flex-1 py-2.5 bg-green-600 text-white rounded-lg font-medium text-sm disabled:opacity-50"
                    >
                      {resolving ? '...' : 'Resolver'}
                    </button>
                    <button
                      onClick={() => handleResolve('dismiss')}
                      disabled={!resolution.trim() || resolving}
                      className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-lg font-medium text-sm disabled:opacity-50"
                    >
                      Descartar
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
