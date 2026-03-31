'use client';

import { useState, useEffect } from 'react';
import { adminApi, type AdminStats } from '../../lib/api';

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    try {
      setLoading(true);
      const data = await adminApi.getStats();
      setStats(data);
    } catch (err: any) {
      setError(err.message || 'Error loading stats');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
        <div className="grid grid-cols-2 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-4 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-20 mb-2" />
              <div className="h-8 bg-gray-200 rounded w-12" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500">{error || 'Error loading data'}</p>
        <button onClick={loadStats} className="mt-4 text-indigo-600 font-medium">
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>

      {/* Pending applications alert */}
      {stats.applications.pending > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <p className="font-semibold text-amber-800">
              {stats.applications.pending} solicitud{stats.applications.pending > 1 ? 'es' : ''} pendiente{stats.applications.pending > 1 ? 's' : ''}
            </p>
            <a href="/admin/applications" className="text-sm text-amber-600 underline">
              Revisar ahora
            </a>
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon="📋"
          label="Solicitudes pendientes"
          value={stats.applications.pending}
          color="amber"
        />
        <StatCard
          icon="✅"
          label="Aprobadas"
          value={stats.applications.approved}
          color="green"
        />
        <StatCard
          icon="👷"
          label="Proveedores activos"
          value={stats.providers.total}
          color="indigo"
        />
        <StatCard
          icon="👥"
          label="Clientes"
          value={stats.customers.total}
          color="blue"
        />
        <StatCard
          icon="📅"
          label="Bookings hoy"
          value={stats.bookings.today}
          color="purple"
        />
        <StatCard
          icon="📆"
          label="Bookings este mes"
          value={stats.bookings.thisMonth}
          color="pink"
        />
      </div>

      {/* Providers by tier */}
      <div className="bg-white rounded-xl p-4">
        <h2 className="font-semibold text-gray-900 mb-3">Proveedores por Tier</h2>
        <div className="space-y-2">
          <TierBar label="Tier 1 — Basic" count={stats.providers.byTier.tier1} total={stats.providers.total} color="bg-gray-400" />
          <TierBar label="Tier 2 — Verified" count={stats.providers.byTier.tier2} total={stats.providers.total} color="bg-blue-500" />
          <TierBar label="Tier 3 — Pro" count={stats.providers.byTier.tier3} total={stats.providers.total} color="bg-yellow-500" />
          <TierBar label="Tier 4 — Elite" count={stats.providers.byTier.tier4} total={stats.providers.total} color="bg-purple-500" />
        </div>
      </div>

      {/* Bookings overview */}
      <div className="bg-white rounded-xl p-4">
        <h2 className="font-semibold text-gray-900 mb-3">Resumen de Bookings</h2>
        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-gray-900">{stats.bookings.total}</p>
            <p className="text-xs text-gray-500">Total</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-green-600">{stats.bookings.completed}</p>
            <p className="text-xs text-gray-500">Completados</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-indigo-600">{stats.bookings.thisWeek}</p>
            <p className="text-xs text-gray-500">Esta semana</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-purple-600">{stats.bookings.today}</p>
            <p className="text-xs text-gray-500">Hoy</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: string;
  label: string;
  value: number;
  color: string;
}) {
  const bgMap: Record<string, string> = {
    amber: 'bg-amber-50',
    green: 'bg-green-50',
    indigo: 'bg-indigo-50',
    blue: 'bg-blue-50',
    purple: 'bg-purple-50',
    pink: 'bg-pink-50',
  };

  return (
    <div className={`${bgMap[color] || 'bg-gray-50'} rounded-xl p-4`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{icon}</span>
        <span className="text-xs text-gray-600">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

function TierBar({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-700">{label}</span>
        <span className="font-medium text-gray-900">{count}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all`}
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>
    </div>
  );
}
