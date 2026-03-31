'use client';

import { useAuth } from '../lib/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import {
  servicesApi,
  providersApi,
  zonesApi,
  type ServiceCategory,
  type ProviderSummary,
  type CityInfo,
} from '../lib/api';
import { useLocation } from '../lib/use-location';
import ErrorState from '../components/ui/error-state';
import { CategoryGridSkeleton, CardListSkeleton } from '../components/ui/skeleton';
import { NotificationBell } from '../components/notifications/notification-bell';
import { PushNotificationPrompt } from '../components/notifications/push-prompt';

const CATEGORY_COLORS: Record<string, string> = {
  plumbing: 'bg-blue-50 text-blue-600',
  electrical: 'bg-yellow-50 text-yellow-600',
  cleaning: 'bg-green-50 text-green-600',
  gardening: 'bg-emerald-50 text-emerald-600',
  painting: 'bg-purple-50 text-purple-600',
  locksmith: 'bg-orange-50 text-orange-600',
  repair: 'bg-red-50 text-red-600',
  moving: 'bg-indigo-50 text-indigo-600',
};

export default function HomePage() {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const router = useRouter();
  const location = useLocation();

  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [featuredProviders, setFeaturedProviders] = useState<ProviderSummary[]>([]);
  const [cities, setCities] = useState<CityInfo[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCityPicker, setShowCityPicker] = useState(false);

  // Redirect providers to their dashboard
  useEffect(() => {
    if (!isLoading && isAuthenticated && user?.role === 'PROVIDER') {
      router.replace('/provider');
    }
  }, [isLoading, isAuthenticated, user, router]);

  const loadData = useCallback(async (city?: string) => {
    try {
      setError(null);
      const [cats, provRes, citiesRes] = await Promise.all([
        servicesApi.getCategories(),
        providersApi.list({ sort: 'rating', limit: 4, city: city || undefined }),
        zonesApi.getCities(),
      ]);
      setCategories(cats);
      setFeaturedProviders(provRes.data);
      setCities(citiesRes);
    } catch (err: unknown) {
      console.error('Failed to load home data:', err);
      if (err && typeof err === 'object' && 'status' in err && (err as any).status === 401) {
        localStorage.removeItem('handy_access_token');
        localStorage.removeItem('handy_refresh_token');
        window.location.href = '/login';
        return;
      }
      setError('No se pudieron cargar los datos');
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    if (isAuthenticated) {
      loadData(location.selectedCity || undefined);
    }
  }, [isAuthenticated, loadData, location.selectedCity]);

  if (isLoading) {
    return (
      <div className="splash-screen">
        <div className="text-center animate-scale-in">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-white/20 backdrop-blur-sm text-white text-4xl mb-4">
            🔧
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">Handy</h1>
          <p className="text-white/70 text-sm">Servicios a tu alcance</p>
          <div className="mt-6 w-8 h-8 border-3 border-white/30 border-t-white rounded-full animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const displayName = user?.name || 'Usuario';
  const firstName = displayName.split(' ')[0];

  // Category slug → display name map for featured providers
  const categoryNameMap: Record<string, string> = {};
  for (const cat of categories) {
    categoryNameMap[cat.slug] = cat.name;
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="px-5 pt-12 pb-6 bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">Hola, {firstName} 👋</h1>
            <p className="text-indigo-100 text-sm">¿Qué necesitas hoy?</p>
          </div>
          <div className="flex items-center gap-1">
            <div className="text-white">
              <NotificationBell />
            </div>
            <button
              onClick={() => router.push('/profile')}
              className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-lg hover:bg-white/30 transition-colors"
              title="Perfil"
            >
              👤
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="relative">
          <input
            type="text"
            placeholder="¿Qué servicio necesitas?"
            className="w-full px-4 py-3 pl-10 rounded-xl bg-white/20 backdrop-blur-sm text-white placeholder-indigo-200 border border-white/30 focus:outline-none focus:ring-2 focus:ring-white/50"
            readOnly
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-200">
            🔍
          </span>
        </div>

        {/* Location bar */}
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => setShowCityPicker(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/20 backdrop-blur-sm text-sm font-medium hover:bg-white/30 transition-colors"
          >
            <span>📍</span>
            <span className="truncate max-w-[140px]">
              {location.selectedCity || 'Todas las ciudades'}
            </span>
            <span className="text-xs opacity-70">▼</span>
          </button>
          {!location.selectedCity && (
            <button
              onClick={location.detectLocation}
              disabled={location.loading}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/20 backdrop-blur-sm text-xs font-medium hover:bg-white/30 transition-colors"
            >
              {location.loading ? (
                <div className="w-3 h-3 border-2 border-white/50 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>🎯</span>
                  <span>Detectar</span>
                </>
              )}
            </button>
          )}
          {location.selectedCity && (
            <button
              onClick={() => {
                location.clearLocation();
              }}
              className="flex items-center gap-1 px-2 py-1.5 rounded-full bg-white/10 text-xs hover:bg-white/20 transition-colors"
            >
              ✕
            </button>
          )}
        </div>
      </header>

      {/* City Picker Modal */}
      {showCityPicker && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[70vh] overflow-hidden animate-slide-up">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-lg text-gray-800">📍 Selecciona tu ciudad</h3>
              <button
                onClick={() => setShowCityPicker(false)}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200"
              >
                ✕
              </button>
            </div>
            <div className="overflow-y-auto max-h-[55vh] p-3">
              {/* All cities option */}
              <button
                onClick={() => {
                  location.clearLocation();
                  setShowCityPicker(false);
                }}
                className={`w-full text-left px-4 py-3 rounded-xl mb-1 transition-colors ${
                  !location.selectedCity
                    ? 'bg-indigo-50 text-indigo-700 font-semibold'
                    : 'hover:bg-gray-50 text-gray-700'
                }`}
              >
                <span className="text-lg mr-2">🌎</span>
                Todas las ciudades
              </button>

              {cities.map((c) => (
                <button
                  key={c.city}
                  onClick={() => {
                    location.setCity(c.city);
                    setShowCityPicker(false);
                  }}
                  className={`w-full text-left px-4 py-3 rounded-xl mb-1 transition-colors ${
                    location.selectedCity === c.city
                      ? 'bg-indigo-50 text-indigo-700 font-semibold'
                      : 'hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-lg mr-2">🏙️</span>
                      {c.city}
                      <span className="text-gray-400 text-xs ml-2">{c.state}</span>
                    </div>
                    <span className="text-xs text-gray-400">{c.zoneCount} zonas</span>
                  </div>
                </button>
              ))}

              {/* GPS button */}
              <button
                onClick={async () => {
                  await location.detectLocation();
                  setShowCityPicker(false);
                }}
                disabled={location.loading}
                className="w-full text-left px-4 py-3 rounded-xl mt-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors font-medium"
              >
                <span className="text-lg mr-2">🎯</span>
                {location.loading ? 'Detectando...' : 'Usar mi ubicación GPS'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 px-5 py-6">
        {/* Service Categories */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4 text-gray-800">
            Servicios disponibles
          </h2>
          {error ? (
            <ErrorState
              message={error}
              onRetry={loadData}
            />
          ) : loadingData ? (
            <CategoryGridSkeleton />
          ) : (
            <div className="grid grid-cols-4 gap-3 stagger-children">
              {categories.map((cat) => (
                <button
                  key={cat.slug}
                  onClick={() => router.push(`/providers?category=${cat.slug}`)}
                  className="flex flex-col items-center gap-2 p-3 rounded-2xl hover:bg-gray-50 active:scale-95 transition-all"
                >
                  <div
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl ${
                      CATEGORY_COLORS[cat.slug] || 'bg-gray-50 text-gray-600'
                    }`}
                  >
                    {cat.icon}
                  </div>
                  <span className="text-xs font-medium text-gray-600 text-center leading-tight">
                    {cat.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Featured Providers */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">
              ⭐ Mejor calificados
            </h2>
            <button
              onClick={() => router.push('/providers')}
              className="text-sm text-indigo-500 font-medium"
            >
              Ver todos →
            </button>
          </div>
          {loadingData ? (
            <CardListSkeleton count={4} />
          ) : (
            <div className="space-y-3 stagger-children">
              {featuredProviders.map((provider) => {
                const mainService =
                  provider.serviceTypes?.[0]
                    ? categoryNameMap[provider.serviceTypes[0]] || provider.serviceTypes[0]
                    : '';

                return (
                  <button
                    key={provider.id}
                    onClick={() => router.push(`/providers/${provider.id}`)}
                    className="w-full flex items-center gap-4 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow text-left"
                  >
                    {/* Avatar */}
                    {provider.avatarUrl ? (
                      <img
                        src={provider.avatarUrl}
                        alt={provider.name || ''}
                        className="w-12 h-12 rounded-full object-cover shrink-0 bg-gray-100"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-bold text-lg shrink-0">
                        {(provider.name || '?')[0]}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-gray-800 truncate">
                          {provider.name}
                        </span>
                        {provider.isVerified && (
                          <span className="text-xs text-blue-500" title="Verificado">
                            ✅
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500">
                        {mainService} · {provider.totalJobs} trabajos
                      </p>
                      {provider.zones && provider.zones.length > 0 && (
                        <p className="text-[10px] text-gray-400 mt-0.5 truncate">
                          📍 {provider.zones.slice(0, 2).map(z => z.name).join(', ')}
                          {provider.zones.length > 2 && ` +${provider.zones.length - 2}`}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-yellow-500 text-sm">⭐</span>
                      <span className="font-semibold text-gray-800">
                        {provider.ratingAverage.toFixed(1)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* CTA Banner */}
        <section className="mb-6">
          <div className="p-5 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white">
            <h3 className="font-bold text-lg mb-1">¿Eres profesional? 🛠️</h3>
            <p className="text-indigo-100 text-sm mb-3">
              Únete a Handy y recibe clientes directo en tu WhatsApp
            </p>
            <button
              onClick={() => router.push('/registro-proveedor')}
              className="px-4 py-2 bg-white text-indigo-600 rounded-xl font-semibold text-sm hover:bg-indigo-50 transition-colors"
            >
              Registrarme como proveedor
            </button>
          </div>
        </section>
      </main>

      {/* Push notification prompt */}
      <PushNotificationPrompt />

      {/* Bottom Navigation */}
      <nav className="sticky bottom-0 px-2 py-2 bg-white border-t border-gray-100 safe-bottom">
        <div className="flex items-center justify-around">
          {[
            { icon: '🏠', label: 'Inicio', href: '/', active: true },
            { icon: '🔍', label: 'Buscar', href: '/providers', active: false },
            { icon: '📋', label: 'Mis Pedidos', href: '/bookings', active: false },
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
