'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '../../lib/api';

const COUNTRY_CODES = [
  { code: '+52', country: '🇲🇽 México', short: 'MX' },
  { code: '+1', country: '🇺🇸 USA', short: 'US' },
  { code: '+57', country: '🇨🇴 Colombia', short: 'CO' },
  { code: '+54', country: '🇦🇷 Argentina', short: 'AR' },
  { code: '+56', country: '🇨🇱 Chile', short: 'CL' },
  { code: '+34', country: '🇪🇸 España', short: 'ES' },
];

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState('+52');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 8 || cleanPhone.length > 12) {
      setError('Ingresa un número de teléfono válido');
      return;
    }

    const fullPhone = `${countryCode}${cleanPhone}`;
    setIsLoading(true);

    try {
      const result = await authApi.requestOtp(fullPhone);
      // In dev mode, the OTP code is returned for convenience
      const params = new URLSearchParams({ phone: fullPhone });
      if (result.code) {
        params.set('devCode', result.code);
      }
      router.push(`/login/verify?${params.toString()}`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Error al enviar el código. Intenta de nuevo.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header / Hero */}
      <div className="flex-1 flex flex-col justify-center px-8 pt-16 pb-8">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-4xl mb-4 shadow-lg">
            🔧
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Handy</h1>
          <p className="text-gray-500 mt-2">Servicios a tu alcance</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tu número de teléfono
            </label>

            <div className="flex gap-2 w-full max-w-full overflow-hidden">
              {/* Country code selector */}
              <select
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                className="shrink-0 w-[140px] px-2 py-3.5 rounded-xl border border-gray-200 bg-gray-50 text-gray-700 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent appearance-none cursor-pointer"
              >
                {COUNTRY_CODES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.country} ({c.code})
                  </option>
                ))}
              </select>

              {/* Phone number */}
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^\d\s-]/g, ''))}
                placeholder="55 1234 5678"
                className="flex-1 min-w-0 px-4 py-3.5 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                autoFocus
                inputMode="numeric"
                autoComplete="tel"
              />
            </div>
          </div>

          {error && (
            <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-100">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || phone.replace(/\D/g, '').length < 8}
            className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold text-lg shadow-md hover:shadow-lg active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Enviando...
              </span>
            ) : (
              'Enviar código'
            )}
          </button>
        </form>

        {/* Terms */}
        <p className="text-center text-xs text-gray-400 mt-6 leading-relaxed">
          Al continuar, aceptas nuestros{' '}
          <span className="text-indigo-500">Términos de Servicio</span> y{' '}
          <span className="text-indigo-500">Política de Privacidad</span>
        </p>
      </div>

      {/* Footer hint */}
      <div className="px-8 py-6 text-center">
        <p className="text-sm text-gray-400">
          Te enviaremos un código de verificación por WhatsApp
        </p>
      </div>
    </div>
  );
}

