'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminApi, type AdminProvider, type AdminProviderListResponse } from '../../../lib/api';

const TIER_LABELS: Record<number, { name: string; badge: string; color: string }> = {
  1: { name: 'Basic', badge: '⬜', color: 'bg-gray-100 text-gray-700' },
  2: { name: 'Verified', badge: '✅', color: 'bg-blue-100 text-blue-700' },
  3: { name: 'Pro', badge: '⭐', color: 'bg-yellow-100 text-yellow-800' },
  4: { name: 'Elite', badge: '🏆', color: 'bg-purple-100 text-purple-800' },
};

export default function ProvidersPage() {
  const [providers, setProviders] = useState<AdminProvider[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tierFilter, setTierFilter] = useState<number | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [editingTier, setEditingTier] = useState<{ id: string; tier: number } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res: AdminProviderListResponse = await adminApi.getProviders({
        tier: tierFilter,
        search: searchDebounced || undefined,
        limit: 50,
      });
      setProviders(res.data);
      setTotal(res.total);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [tierFilter, searchDebounced]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleTierChange(providerId: string, newTier: number) {
    if (actionLoading) return;
    try {
      setActionLoading(true);
      await adminApi.updateProviderTier(providerId, newTier);
      setEditingTier(null);
      await load();
    } catch (err: any) {
      alert(err.message || 'Error al cambiar tier');
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Proveedores</h1>
        <span className="text-sm text-gray-500">{total} total</span>
      </div>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar por nombre o teléfono..."
        className="w-full bg-white border rounded-xl px-4 py-2.5 text-sm"
      />

      {/* Tier filter */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setTierFilter(undefined)}
          className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
            tierFilter === undefined
              ? 'bg-indigo-600 text-white'
              : 'bg-white text-gray-600 border hover:bg-gray-50'
          }`}
        >
          Todos
        </button>
        {[1, 2, 3, 4].map((t) => (
          <button
            key={t}
            onClick={() => setTierFilter(t)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              tierFilter === t
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-600 border hover:bg-gray-50'
            }`}
          >
            {TIER_LABELS[t].badge} Tier {t}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-4 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-32 mb-2" />
              <div className="h-4 bg-gray-200 rounded w-24" />
            </div>
          ))}
        </div>
      ) : providers.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-4xl mb-2">👷</p>
          <p>No se encontraron proveedores</p>
        </div>
      ) : (
        <div className="space-y-3">
          {providers.map((provider) => {
            const tier = TIER_LABELS[provider.tier] || TIER_LABELS[1];
            return (
              <div key={provider.id} className="bg-white rounded-xl p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold text-gray-900">
                      {provider.user.name || 'Sin nombre'}
                    </p>
                    <p className="text-sm text-gray-500">{provider.user.phone}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${tier.color}`}>
                    {tier.badge} Tier {provider.tier}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-xs text-gray-500 mb-2">
                  <span>⭐ {provider.user.ratingAverage.toFixed(1)} ({provider.user.ratingCount})</span>
                  <span>📋 {provider._count.bookings} jobs</span>
                  {provider.trustScore && (
                    <span>🛡 {provider.trustScore.score.toFixed(0)}pts</span>
                  )}
                  <span className={provider.isAvailable ? 'text-green-600' : 'text-gray-400'}>
                    {provider.isAvailable ? '🟢 Activo' : '🔴 Inactivo'}
                  </span>
                </div>

                {/* Tier edit */}
                {editingTier?.id === provider.id ? (
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t">
                    <select
                      value={editingTier.tier}
                      onChange={(e) =>
                        setEditingTier({ ...editingTier, tier: Number(e.target.value) })
                      }
                      className="flex-1 border rounded-lg px-2 py-1.5 text-sm"
                    >
                      {[1, 2, 3, 4].map((t) => (
                        <option key={t} value={t}>
                          Tier {t} — {TIER_LABELS[t].name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleTierChange(provider.id, editingTier.tier)}
                      disabled={actionLoading || editingTier.tier === provider.tier}
                      className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm disabled:opacity-50"
                    >
                      {actionLoading ? '...' : 'Guardar'}
                    </button>
                    <button
                      onClick={() => setEditingTier(null)}
                      className="px-3 py-1.5 border rounded-lg text-sm text-gray-600"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setEditingTier({ id: provider.id, tier: provider.tier })}
                    className="mt-2 text-xs text-indigo-600 font-medium"
                  >
                    Cambiar tier
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
