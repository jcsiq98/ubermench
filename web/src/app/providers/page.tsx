'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useCallback, Suspense } from 'react';
import { useAuth } from '../../lib/auth-context';
import {
  providersApi,
  servicesApi,
  zonesApi,
  type ProviderSummary,
  type ServiceCategory,
  type ServiceZone,
} from '../../lib/api';
import { useLocation } from '../../lib/use-location';
import EmptyState from '../../components/ui/empty-state';
import ErrorState from '../../components/ui/error-state';
import { CardListSkeleton } from '../../components/ui/skeleton';

const CATEGORY_COLORS: Record<string, string> = {
  plumbing: 'bg-blue-100 text-blue-700 border-blue-200',
  electrical: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  cleaning: 'bg-green-100 text-green-700 border-green-200',
  gardening: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  painting: 'bg-purple-100 text-purple-700 border-purple-200',
  locksmith: 'bg-orange-100 text-orange-700 border-orange-200',
  repair: 'bg-red-100 text-red-700 border-red-200',
  moving: 'bg-indigo-100 text-indigo-700 border-indigo-200',
};

function ProvidersListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const location = useLocation();

  const categorySlug = searchParams.get('category') || '';

  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [zones, setZones] = useState<ServiceZone[]>([]);
  const [selectedCategory, setSelectedCategory] = useState(categorySlug);
  const [selectedZone, setSelectedZone] = useState<string>('');
  const [sortBy, setSortBy] = useState<'rating' | 'distance' | 'jobs'>('rating');
  const [showZoneFilter, setShowZoneFilter] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [userLat, setUserLat] = useState<number | undefined>(undefined);
  const [userLng, setUserLng] = useState<number | undefined>(undefined);

  const categoryNameMap: Record<string, string> = {};
  for (const cat of categories) {
    categoryNameMap[cat.slug] = cat.name;
  }

  const loadCategories = useCallback(async () => {
    try {
      const cats = await servicesApi.getCategories();
      setCategories(cats);
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
  }, []);

  const loadZones = useCallback(async () => {
    try {
      const z = await zonesApi.list({
        city: location.selectedCity || undefined,
      });
      setZones(z);
    } catch (err) {
      console.error('Failed to load zones:', err);
    }
  }, [location.selectedCity]);

  // Get user's GPS on mount for distance sorting
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLat(pos.coords.latitude);
          setUserLng(pos.coords.longitude);
        },
        () => {},
        { enableHighAccuracy: false, timeout: 5000 },
      );
    }
  }, []);

  const loadProviders = useCallback(
    async (category: string, zoneId?: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await providersApi.list({
          category: category || undefined,
          zone: zoneId || undefined,
          city: !zoneId ? (location.selectedCity || undefined) : undefined,
          sort: sortBy,
          lat: userLat,
          lng: userLng,
          limit: 50,
        });
        setProviders(res.data);
        setTotal(res.total);
      } catch (err: unknown) {
        console.error('Failed to load providers:', err);
        setError('No se pudieron cargar los proveedores');
      } finally {
        setLoading(false);
      }
    },
    [location.selectedCity, sortBy, userLat, userLng],
  );

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (isAuthenticated) {
      loadCategories();
      loadZones();
    }
  }, [isAuthenticated, loadCategories, loadZones]);

  useEffect(() => {
    if (isAuthenticated) {
      loadProviders(selectedCategory, selectedZone || undefined);
    }
  }, [isAuthenticated, selectedCategory, selectedZone, sortBy, loadProviders]);

  const handleCategoryChange = (slug: string) => {
    setSelectedCategory(slug);
    const url = slug ? `/providers?category=${slug}` : '/providers';
    window.history.replaceState(null, '', url);
  };

  const handleZoneChange = (zoneId: string) => {
    setSelectedZone(zoneId);
    setShowZoneFilter(false);
  };

  const handleRefresh = () => {
    loadProviders(selectedCategory, selectedZone || undefined);
  };

  if (authLoading || !isAuthenticated) return null;

  const currentCat = categories.find((c) => c.slug === selectedCategory);
  const title = currentCat
    ? `${currentCat.icon} ${currentCat.name}`
    : 'Todos los proveedores';

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 pt-12 pb-3">
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => router.push('/')}
            className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
          >
            ←
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-gray-800">{title}</h1>
            <p className="text-xs text-gray-500">
              {loading ? 'Buscando...' : `${total} proveedores encontrados`}
            </p>
          </div>
        </div>

        {/* Category pills */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-4 px-4">
          <button
            onClick={() => handleCategoryChange('')}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              selectedCategory === ''
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            }`}
          >
            Todos
          </button>
          {categories.map((cat) => (
            <button
              key={cat.slug}
              onClick={() => handleCategoryChange(cat.slug)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                selectedCategory === cat.slug
                  ? CATEGORY_COLORS[cat.slug] || 'bg-indigo-100 text-indigo-700 border-indigo-200'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              {cat.icon} {cat.name}
            </button>
          ))}
        </div>

        {/* Sort options */}
        <div className="flex items-center gap-1.5 mt-2 -mx-4 px-4">
          <span className="text-[10px] text-gray-400 shrink-0">Ordenar:</span>
          {([
            { key: 'rating' as const, label: '⭐ Rating' },
            { key: 'distance' as const, label: '📍 Cercanía' },
            { key: 'jobs' as const, label: '🔧 Experiencia' },
          ]).map((s) => (
            <button
              key={s.key}
              onClick={() => setSortBy(s.key)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-medium border transition-colors ${
                sortBy === s.key
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                  : 'bg-white text-gray-500 border-gray-200'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Zone filter bar */}
        <div className="flex items-center gap-2 mt-2 -mx-4 px-4 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setShowZoneFilter(!showZoneFilter)}
            className={`shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              selectedZone
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
            }`}
          >
            📍 {selectedZone
              ? zones.find(z => z.id === selectedZone)?.name || 'Zona'
              : location.selectedCity || 'Filtrar por zona'}
            <span className="text-[10px] opacity-60">▼</span>
          </button>
          {selectedZone && (
            <button
              onClick={() => setSelectedZone('')}
              className="shrink-0 px-2 py-1.5 rounded-full text-xs bg-gray-100 text-gray-500 hover:bg-gray-200"
            >
              ✕
            </button>
          )}
        </div>
      </header>

      {/* Zone picker dropdown */}
      {showZoneFilter && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[70vh] overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-lg text-gray-800">📍 Filtrar por zona</h3>
              <button
                onClick={() => setShowZoneFilter(false)}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200"
              >
                ✕
              </button>
            </div>
            <div className="overflow-y-auto max-h-[55vh] p-3">
              <button
                onClick={() => handleZoneChange('')}
                className={`w-full text-left px-4 py-3 rounded-xl mb-1 transition-colors ${
                  !selectedZone
                    ? 'bg-indigo-50 text-indigo-700 font-semibold'
                    : 'hover:bg-gray-50 text-gray-700'
                }`}
              >
                🌎 Todas las zonas
              </button>
              {zones.map((z) => (
                <button
                  key={z.id}
                  onClick={() => handleZoneChange(z.id)}
                  className={`w-full text-left px-4 py-3 rounded-xl mb-1 transition-colors ${
                    selectedZone === z.id
                      ? 'bg-emerald-50 text-emerald-700 font-semibold'
                      : 'hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>📍 {z.name}</span>
                    <span className="text-xs text-gray-400">
                      {z.providerCount} proveedores
                    </span>
                  </div>
                </button>
              ))}
              {zones.length === 0 && (
                <p className="text-center text-gray-400 text-sm py-6">
                  No hay zonas disponibles
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Provider list */}
      <main className="flex-1 px-4 py-4">
        {loading ? (
          <CardListSkeleton count={6} />
        ) : error ? (
          <ErrorState
            message={error}
            onRetry={() => loadProviders(selectedCategory)}
            onBack={() => router.push('/')}
          />
        ) : providers.length === 0 ? (
          <EmptyState
            icon="🔍"
            title="No se encontraron proveedores"
            description="No hay proveedores disponibles en esta categoría por el momento"
            action={{ label: 'Ver todas las categorías', onClick: () => handleCategoryChange('') }}
          />
        ) : (
          <div className="space-y-3 stagger-children">
            {providers.map((provider) => {
              const mainService =
                provider.serviceTypes?.[0]
                  ? categoryNameMap[provider.serviceTypes[0]] || provider.serviceTypes[0]
                  : '';

              return (
                <button
                  key={provider.id}
                  onClick={() => router.push(`/providers/${provider.id}`)}
                  className="w-full flex items-start gap-4 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all text-left active:scale-[0.98]"
                >
                  {/* Avatar */}
                  {provider.avatarUrl ? (
                    <img
                      src={provider.avatarUrl}
                      alt={provider.name || ''}
                      className="w-14 h-14 rounded-full object-cover shrink-0 bg-gray-100"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-bold text-xl shrink-0">
                      {(provider.name || '?')[0]}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="font-semibold text-gray-800 truncate">
                        {provider.name}
                      </span>
                      {provider.isVerified && (
                        <span className="text-xs" title="Verificado">
                          ✅
                        </span>
                      )}
                      {provider.tier && provider.tier >= 3 && (
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                            provider.tier === 4
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-yellow-100 text-yellow-700'
                          }`}
                          title={provider.tier === 4 ? 'Elite' : 'Pro'}
                        >
                          {provider.tier === 4 ? '🏆 Elite' : '⭐ Pro'}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mb-1">
                      <div className="flex items-center gap-0.5">
                        <span className="text-yellow-500 text-xs">⭐</span>
                        <span className="text-sm font-semibold text-gray-800">
                          {provider.ratingAverage.toFixed(1)}
                        </span>
                        <span className="text-xs text-gray-400">
                          ({provider.ratingCount})
                        </span>
                      </div>
                      <span className="text-gray-300">·</span>
                      <span className="text-xs text-gray-500">
                        {provider.totalJobs} trabajos
                      </span>
                      {provider.distance !== undefined && provider.distance !== null && (
                        <>
                          <span className="text-gray-300">·</span>
                          <span className="text-xs text-indigo-600 font-medium">
                            📍 {provider.distance < 1
                              ? `${Math.round(provider.distance * 1000)} m`
                              : `${provider.distance.toFixed(1)} km`}
                          </span>
                        </>
                      )}
                    </div>

                    <p className="text-xs text-gray-500 line-clamp-2">
                      {provider.bio}
                    </p>

                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className="text-xs text-gray-500">
                        {mainService}
                      </span>
                      {provider.isAvailable ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-green-600 text-[10px] font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                          Disponible
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                          Ocupado
                        </span>
                      )}
                    </div>
                    {/* Zones */}
                    {provider.zones && provider.zones.length > 0 && (
                      <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                        <span className="text-[10px] text-gray-400">📍</span>
                        <span className="text-[10px] text-gray-400 truncate">
                          {provider.zones.slice(0, 3).map(z => z.name).join(', ')}
                          {provider.zones.length > 3 && ` +${provider.zones.length - 3}`}
                        </span>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}

            {/* Pull to refresh hint */}
            <div className="text-center py-4">
              <button
                onClick={handleRefresh}
                className="text-xs text-indigo-500 font-medium"
              >
                ↻ Actualizar lista
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function ProvidersPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-3xl mb-4 animate-pulse">
              🔍
            </div>
            <p className="text-gray-400 text-sm">Cargando proveedores...</p>
          </div>
        </div>
      }
    >
      <ProvidersListContent />
    </Suspense>
  );
}


