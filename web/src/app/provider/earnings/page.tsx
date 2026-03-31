'use client';

import { useEffect, useState } from 'react';
import { providerApi, type ProviderEarnings } from '../../../lib/api';

export default function ProviderEarningsPage() {
  const [data, setData] = useState<ProviderEarnings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    providerApi.getEarnings()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-5 text-center">
        <p className="text-sm text-gray-500">No se pudieron cargar las ganancias</p>
      </div>
    );
  }

  return (
    <div className="px-5 py-5 space-y-5">
      <h2 className="text-lg font-bold text-gray-800">💰 Ganancias</h2>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-gray-500">Este mes</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">
            ${data.thisMonth.total.toLocaleString('es-MX')}
          </p>
          <p className="text-xs text-gray-400">{data.thisMonth.jobs} trabajos</p>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-gray-500">Mes anterior</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">
            ${data.lastMonth.total.toLocaleString('es-MX')}
          </p>
          <p className="text-xs text-gray-400">{data.lastMonth.jobs} trabajos</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <p className="text-xs text-gray-500">Total trabajos completados</p>
        <p className="text-3xl font-bold text-gray-800 mt-1">{data.allTimeJobs}</p>
      </div>

      <div className="bg-amber-50 rounded-2xl p-4 border border-amber-200">
        <p className="text-sm text-amber-800 font-medium">📊 Próximamente</p>
        <p className="text-xs text-amber-700 mt-1">
          Cuando se implemente el sistema de pagos, aquí verás el desglose detallado de tus ganancias,
          historial de pagos y podrás exportar a CSV.
        </p>
      </div>
    </div>
  );
}
