'use client';

import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../../../lib/auth-context';
import {
  providersApi,
  bookingsApi,
  addressesApi,
  type ProviderDetail,
  type SavedAddress,
} from '../../../lib/api';

type Step = 'description' | 'address' | 'schedule' | 'confirm' | 'sending' | 'done';

export default function BookingFlowPage() {
  const router = useRouter();
  const params = useParams();
  const providerId = params.providerId as string;
  const { isLoading: authLoading, isAuthenticated } = useAuth();

  const [provider, setProvider] = useState<ProviderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>('description');
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [scheduleOption, setScheduleOption] = useState<'today' | 'tomorrow' | 'custom'>('today');
  const [customDate, setCustomDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createdBookingId, setCreatedBookingId] = useState<string | null>(null);

  // Address/location state
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [autocompleteResults, setAutocompleteResults] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [googleLoaded, setGoogleLoaded] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveLabel, setSaveLabel] = useState('');
  const autocompleteService = useRef<google.maps.places.AutocompleteService | null>(null);
  const geocoder = useRef<google.maps.Geocoder | null>(null);
  const addressInputRef = useRef<HTMLInputElement>(null);

  const loadProvider = useCallback(async () => {
    try {
      const data = await providersApi.getDetail(providerId);
      setProvider(data);
    } catch {
      setError('No se pudo cargar el proveedor');
    } finally {
      setLoading(false);
    }
  }, [providerId]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (isAuthenticated && providerId) {
      loadProvider();
      addressesApi.list().then(setSavedAddresses).catch(() => {});
    }
  }, [isAuthenticated, providerId, loadProvider]);

  // Load Google Maps JS API
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
    if (!apiKey || typeof window === 'undefined') return;
    if (window.google?.maps?.places) {
      setGoogleLoaded(true);
      autocompleteService.current = new google.maps.places.AutocompleteService();
      geocoder.current = new google.maps.Geocoder();
      return;
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.onload = () => {
      setGoogleLoaded(true);
      autocompleteService.current = new google.maps.places.AutocompleteService();
      geocoder.current = new google.maps.Geocoder();
    };
    document.head.appendChild(script);
  }, []);

  const handleAddressInput = useCallback(
    (value: string) => {
      setAddress(value);
      setLat(null);
      setLng(null);
      if (!value || value.length < 3 || !autocompleteService.current) {
        setAutocompleteResults([]);
        setShowAutocomplete(false);
        return;
      }
      autocompleteService.current.getPlacePredictions(
        { input: value, componentRestrictions: { country: 'mx' } },
        (predictions) => {
          setAutocompleteResults(predictions || []);
          setShowAutocomplete(!!predictions?.length);
        },
      );
    },
    [],
  );

  const selectPlace = useCallback((placeId: string, description: string) => {
    setAddress(description);
    setShowAutocomplete(false);
    if (!geocoder.current) return;
    geocoder.current.geocode({ placeId }, (results, status) => {
      if (status === 'OK' && results?.[0]) {
        const loc = results[0].geometry.location;
        setLat(loc.lat());
        setLng(loc.lng());
      }
    });
  }, []);

  const useCurrentLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      setError('Tu navegador no soporta geolocalización');
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setLat(latitude);
        setLng(longitude);
        if (geocoder.current) {
          geocoder.current.geocode(
            { location: { lat: latitude, lng: longitude } },
            (results, status) => {
              if (status === 'OK' && results?.[0]) {
                setAddress(results[0].formatted_address);
              } else {
                setAddress(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
              }
              setGpsLoading(false);
            },
          );
        } else {
          setAddress(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
          setGpsLoading(false);
        }
      },
      () => {
        setError('No se pudo obtener tu ubicación. Verifica los permisos.');
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  const selectSavedAddress = useCallback((addr: SavedAddress) => {
    setAddress(addr.address);
    setLat(addr.lat);
    setLng(addr.lng);
  }, []);

  const handleSaveAddress = useCallback(async () => {
    if (!saveLabel.trim() || !address || !lat || !lng) return;
    try {
      const saved = await addressesApi.create({ label: saveLabel.trim(), address, lat, lng });
      setSavedAddresses((prev) => [saved, ...prev]);
      setShowSaveDialog(false);
      setSaveLabel('');
    } catch {
      setError('No se pudo guardar la dirección');
    }
  }, [saveLabel, address, lat, lng]);

  const getScheduledAt = (): string | undefined => {
    const now = new Date();
    switch (scheduleOption) {
      case 'today':
        return undefined; // ASAP
      case 'tomorrow': {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(9, 0, 0, 0);
        return tomorrow.toISOString();
      }
      case 'custom':
        return customDate ? new Date(customDate).toISOString() : undefined;
    }
  };

  const handleSubmit = async () => {
    if (!provider) return;
    setSubmitting(true);
    setStep('sending');

    try {
      // Get first matching category ID
      const categorySlug =
        provider.serviceTypes && Array.isArray(provider.serviceTypes)
          ? (provider.serviceTypes as string[])[0]
          : null;

      // We need the category ID — use the serviceNames map
      // The provider detail has serviceNames as { slug: "icon name" }
      // But we need the actual category ID. Let's fetch categories.
      const { servicesApi } = await import('../../../lib/api');
      const categories = await servicesApi.getCategories();
      const matchedCategory = categorySlug
        ? categories.find((c) => c.slug === categorySlug)
        : categories[0];

      if (!matchedCategory) {
        throw new Error('No se encontró la categoría del servicio');
      }

      const booking = await bookingsApi.create({
        providerId: provider.id,
        categoryId: matchedCategory.id,
        description,
        address: address || undefined,
        lat: lat || undefined,
        lng: lng || undefined,
        scheduledAt: getScheduledAt(),
      });

      setCreatedBookingId(booking.id);

      // Brief pause for animation
      await new Promise((r) => setTimeout(r, 1500));
      setStep('done');
    } catch (err: unknown) {
      console.error('Booking creation error:', err);
      // If unauthorized, redirect to login
      if (err && typeof err === 'object' && 'status' in err && (err as any).status === 401) {
        router.replace('/login');
        return;
      }
      const message = err instanceof Error ? err.message : 'Error al crear la solicitud';
      setError(message);
      setStep('confirm');
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || !isAuthenticated) return null;

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!provider) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center">
        <span className="text-5xl mb-4">😕</span>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">
          {error || 'Proveedor no encontrado'}
        </h2>
        <button onClick={() => router.back()} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium mt-4">
          ← Volver
        </button>
      </div>
    );
  }

  // Progress calculation
  const steps: Step[] = ['description', 'address', 'schedule', 'confirm'];
  const currentStepIdx = steps.indexOf(step);
  const progress = step === 'sending' || step === 'done'
    ? 100
    : ((currentStepIdx + 1) / steps.length) * 100;

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="px-5 pt-12 pb-4 border-b border-gray-100">
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => {
              if (step === 'done') {
                router.push('/bookings');
              } else if (currentStepIdx > 0 && step !== 'sending') {
                setStep(steps[currentStepIdx - 1]);
              } else {
                router.back();
              }
            }}
            className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
          >
            ←
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-gray-800">Solicitar Servicio</h1>
            <p className="text-xs text-gray-500">
              {provider.name} · {Object.values(provider.serviceNames || {})[0] || ''}
            </p>
          </div>
        </div>
        {/* Progress bar */}
        <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </header>

      {/* Step content */}
      <main className="flex-1 px-5 py-6">
        {/* Step 1: Description */}
        {step === 'description' && (
          <div className="space-y-4 animate-in fade-in">
            <div>
              <h2 className="text-xl font-bold text-gray-800 mb-1">
                ¿Qué necesitas? 📝
              </h2>
              <p className="text-sm text-gray-500">
                Describe el problema o servicio que necesitas
              </p>
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej: Se me rompió un tubo debajo del fregadero y hay una fuga de agua..."
              rows={5}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none resize-none text-sm transition-colors"
              autoFocus
            />
            <p className="text-xs text-gray-400 text-right">
              {description.length}/500 caracteres
            </p>

            {/* Quick suggestions */}
            <div>
              <p className="text-xs text-gray-500 mb-2">Sugerencias rápidas:</p>
              <div className="flex flex-wrap gap-2">
                {getQuickSuggestions(provider.serviceTypes as string[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setDescription(s)}
                    className="px-3 py-1.5 rounded-full bg-gray-100 text-xs text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Address */}
        {step === 'address' && (
          <div className="space-y-4 animate-in fade-in">
            <div>
              <h2 className="text-xl font-bold text-gray-800 mb-1">
                ¿Dónde? 📍
              </h2>
              <p className="text-sm text-gray-500">
                Indica la dirección donde se necesita el servicio
              </p>
            </div>

            {/* GPS button */}
            <button
              onClick={useCurrentLocation}
              disabled={gpsLoading}
              className="w-full flex items-center gap-3 p-3.5 rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50 hover:bg-indigo-100 transition-colors text-left disabled:opacity-50"
            >
              {gpsLoading ? (
                <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <span className="text-lg">📍</span>
              )}
              <div>
                <p className="text-sm font-semibold text-indigo-700">Usar mi ubicación actual</p>
                <p className="text-xs text-indigo-500">Detectar automáticamente con GPS</p>
              </div>
            </button>

            {/* Saved addresses */}
            {savedAddresses.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-2 font-medium">Direcciones guardadas:</p>
                <div className="flex flex-wrap gap-2">
                  {savedAddresses.map((addr) => (
                    <button
                      key={addr.id}
                      onClick={() => selectSavedAddress(addr)}
                      className={`px-3 py-2 rounded-xl text-xs transition-all ${
                        address === addr.address && lat === addr.lat
                          ? 'bg-indigo-100 text-indigo-700 border border-indigo-300'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-transparent'
                      }`}
                    >
                      {addr.isDefault ? '⭐ ' : ''}{addr.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Address input with autocomplete */}
            <div className="relative">
              <input
                ref={addressInputRef}
                type="text"
                value={address}
                onChange={(e) => handleAddressInput(e.target.value)}
                onFocus={() => autocompleteResults.length > 0 && setShowAutocomplete(true)}
                placeholder={googleLoaded ? 'Escribe tu dirección...' : 'Ej: Calle Reforma 123, Col. Roma Norte, CDMX'}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none text-sm transition-colors"
                autoFocus
              />
              {lat && lng && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500 text-sm">✓</span>
              )}

              {/* Autocomplete dropdown */}
              {showAutocomplete && autocompleteResults.length > 0 && (
                <div className="absolute z-20 top-full mt-1 w-full bg-white rounded-xl shadow-lg border border-gray-200 max-h-60 overflow-y-auto">
                  {autocompleteResults.map((pred) => (
                    <button
                      key={pred.place_id}
                      onClick={() => selectPlace(pred.place_id, pred.description)}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-0 transition-colors"
                    >
                      <p className="text-sm text-gray-800">{pred.structured_formatting?.main_text}</p>
                      <p className="text-xs text-gray-500">{pred.structured_formatting?.secondary_text}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Map preview */}
            {lat && lng && (
              <div className="rounded-xl overflow-hidden border border-gray-200">
                <img
                  src={`https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=16&size=600x200&scale=2&markers=color:red%7C${lat},${lng}&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || ''}`}
                  alt="Ubicación seleccionada"
                  className="w-full h-36 object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                <div className="p-3 bg-green-50">
                  <p className="text-xs text-green-700 font-medium">✓ Ubicación confirmada</p>
                  <p className="text-xs text-green-600 truncate">{address}</p>
                </div>
              </div>
            )}

            {/* Save address option */}
            {lat && lng && address && !savedAddresses.find((a) => a.lat === lat && a.lng === lng) && (
              <>
                {!showSaveDialog ? (
                  <button
                    onClick={() => setShowSaveDialog(true)}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    💾 Guardar esta dirección para futuras solicitudes
                  </button>
                ) : (
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={saveLabel}
                      onChange={(e) => setSaveLabel(e.target.value)}
                      placeholder="Ej: Mi casa, Oficina..."
                      className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400"
                      autoFocus
                    />
                    <button
                      onClick={handleSaveAddress}
                      disabled={!saveLabel.trim()}
                      className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs font-medium disabled:opacity-50"
                    >
                      Guardar
                    </button>
                    <button
                      onClick={() => { setShowSaveDialog(false); setSaveLabel(''); }}
                      className="px-2 py-2 text-gray-400 text-sm"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </>
            )}

            {!googleLoaded && (
              <p className="text-xs text-gray-400">
                💡 El autocompletado de direcciones estará disponible cuando se configure Google Maps
              </p>
            )}
          </div>
        )}

        {/* Step 3: Schedule */}
        {step === 'schedule' && (
          <div className="space-y-4 animate-in fade-in">
            <div>
              <h2 className="text-xl font-bold text-gray-800 mb-1">
                ¿Cuándo? 📅
              </h2>
              <p className="text-sm text-gray-500">
                Elige cuándo necesitas el servicio
              </p>
            </div>
            <div className="space-y-3">
              {([
                { value: 'today', label: 'Lo antes posible', sublabel: 'Hoy', icon: '⚡' },
                { value: 'tomorrow', label: 'Mañana', sublabel: 'A las 9:00 AM', icon: '🌅' },
                { value: 'custom', label: 'Elegir fecha', sublabel: 'Selecciona día y hora', icon: '📅' },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setScheduleOption(opt.value)}
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left ${
                    scheduleOption === opt.value
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-100 bg-white hover:border-gray-200'
                  }`}
                >
                  <span className="text-2xl">{opt.icon}</span>
                  <div>
                    <p className="font-semibold text-gray-800 text-sm">{opt.label}</p>
                    <p className="text-xs text-gray-500">{opt.sublabel}</p>
                  </div>
                  {scheduleOption === opt.value && (
                    <span className="ml-auto text-indigo-600">✓</span>
                  )}
                </button>
              ))}
            </div>
            {scheduleOption === 'custom' && (
              <input
                type="datetime-local"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none text-sm transition-colors"
              />
            )}
          </div>
        )}

        {/* Step 4: Confirm */}
        {step === 'confirm' && (
          <div className="space-y-5 animate-in fade-in">
            <div>
              <h2 className="text-xl font-bold text-gray-800 mb-1">
                Confirmar solicitud ✅
              </h2>
              <p className="text-sm text-gray-500">
                Revisa los detalles antes de enviar
              </p>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-red-50 text-red-600 text-sm">
                {error}
              </div>
            )}

            {/* Provider card */}
            <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-2xl">
              {provider.avatarUrl ? (
                <img src={provider.avatarUrl} alt="" className="w-12 h-12 rounded-full object-cover bg-gray-200" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-bold text-lg">
                  {(provider.name || '?')[0]}
                </div>
              )}
              <div>
                <p className="font-semibold text-gray-800">{provider.name}</p>
                <p className="text-xs text-gray-500">
                  ⭐ {provider.ratingAverage.toFixed(1)} · {provider.totalJobs} trabajos
                </p>
              </div>
            </div>

            {/* Summary */}
            <div className="space-y-3">
              <SummaryRow icon="📝" label="Descripción" value={description} />
              <SummaryRow
                icon="📍"
                label="Dirección"
                value={`${address || 'No especificada'}${lat && lng ? ' ✓ GPS' : ''}`}
              />
              <SummaryRow
                icon="📅"
                label="Cuándo"
                value={
                  scheduleOption === 'today'
                    ? 'Lo antes posible (hoy)'
                    : scheduleOption === 'tomorrow'
                      ? 'Mañana a las 9:00 AM'
                      : customDate
                        ? new Date(customDate).toLocaleString('es-MX', {
                            weekday: 'long',
                            day: 'numeric',
                            month: 'long',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'No especificada'
                }
              />
              <SummaryRow
                icon={'🔧'}
                label="Servicio"
                value={Object.values(provider.serviceNames || {})[0] || ''}
              />
            </div>
          </div>
        )}

        {/* Sending animation */}
        {step === 'sending' && (
          <div className="flex flex-col items-center justify-center py-20 animate-in fade-in">
            <div className="w-20 h-20 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-6" />
            <h2 className="text-xl font-bold text-gray-800 mb-2">
              Enviando solicitud...
            </h2>
            <p className="text-sm text-gray-500 text-center">
              Estamos contactando a {provider.name}
            </p>
          </div>
        )}

        {/* Done */}
        {step === 'done' && (
          <div className="flex flex-col items-center justify-center py-16 animate-in fade-in">
            <div className="w-24 h-24 rounded-full bg-green-100 flex items-center justify-center text-5xl mb-6 animate-bounce">
              ✅
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">
              ¡Solicitud enviada!
            </h2>
            <p className="text-sm text-gray-500 text-center mb-8 max-w-xs">
              {provider.name} recibirá tu solicitud y podrá aceptarla.
              Te notificaremos cuando responda.
            </p>
            <div className="space-y-3 w-full max-w-xs">
              <button
                onClick={() => router.push(`/bookings/${createdBookingId}`)}
                className="w-full py-3.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-semibold text-sm shadow-lg shadow-indigo-200"
              >
                Ver seguimiento
              </button>
              <button
                onClick={() => router.push('/')}
                className="w-full py-3.5 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-colors"
              >
                Volver al inicio
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Bottom CTA */}
      {step !== 'sending' && step !== 'done' && (
        <div className="px-5 py-4 border-t border-gray-100 safe-bottom">
          <button
            onClick={() => {
              setError(null);
              if (step === 'description') {
                if (!description.trim()) {
                  setError('Por favor describe lo que necesitas');
                  return;
                }
                setStep('address');
              } else if (step === 'address') {
                setStep('schedule');
              } else if (step === 'schedule') {
                if (scheduleOption === 'custom' && !customDate) {
                  setError('Por favor selecciona una fecha');
                  return;
                }
                setStep('confirm');
              } else if (step === 'confirm') {
                handleSubmit();
              }
            }}
            disabled={submitting}
            className="w-full py-3.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-semibold text-sm shadow-lg shadow-indigo-200 active:scale-95 transition-transform disabled:opacity-50"
          >
            {step === 'confirm' ? '🚀 Confirmar y enviar' : 'Continuar →'}
          </button>
        </div>
      )}
    </div>
  );
}

function SummaryRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
      <span className="text-lg shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-gray-400 font-medium">{label}</p>
        <p className="text-sm text-gray-800">{value}</p>
      </div>
    </div>
  );
}

function getQuickSuggestions(serviceTypes: string[]): string[] {
  const suggestions: Record<string, string[]> = {
    plumbing: ['Fuga de agua en el baño', 'Tubería tapada', 'Reparación de llave/grifo'],
    electrical: ['Se fue la luz en una parte', 'Instalar apagador/contacto', 'Corto circuito'],
    cleaning: ['Limpieza profunda de casa', 'Limpieza post-mudanza', 'Limpieza de oficina'],
    gardening: ['Corte de pasto', 'Poda de árboles', 'Diseño de jardín'],
    painting: ['Pintar una habitación', 'Pintar fachada exterior', 'Impermeabilizar azotea'],
    locksmith: ['No puedo abrir mi puerta', 'Cambio de chapa', 'Duplicar llaves'],
    repair: ['Reparación de mueble', 'Arreglar puerta', 'Mantenimiento general'],
    moving: ['Mudanza local', 'Mover muebles pesados', 'Embalaje y transporte'],
  };

  const result: string[] = [];
  for (const type of serviceTypes || []) {
    if (suggestions[type]) {
      result.push(...suggestions[type]);
    }
  }
  return result.length > 0 ? result.slice(0, 4) : ['Necesito ayuda con...'];
}


