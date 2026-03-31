'use client';

import { useState, useRef, useEffect, type KeyboardEvent, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authApi } from '../../../lib/api';
import { useAuth } from '../../../lib/auth-context';

function VerifyOtpContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();

  const phone = searchParams.get('phone') || '';
  const devCode = searchParams.get('devCode') || '';

  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendTimer, setResendTimer] = useState(60);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Redirect if no phone
  useEffect(() => {
    if (!phone) {
      router.replace('/login');
    }
  }, [phone, router]);

  // Countdown for resend
  useEffect(() => {
    if (resendTimer <= 0) return;
    const timer = setTimeout(() => setResendTimer((t) => t - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendTimer]);

  // Auto-focus first input
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newDigits = [...digits];

    if (value.length > 1) {
      // Handle paste: distribute digits across inputs
      const pastedDigits = value.slice(0, 6).split('');
      pastedDigits.forEach((d, i) => {
        if (index + i < 6) newDigits[index + i] = d;
      });
      setDigits(newDigits);
      const nextIndex = Math.min(index + pastedDigits.length, 5);
      inputRefs.current[nextIndex]?.focus();
    } else {
      newDigits[index] = value;
      setDigits(newDigits);

      // Auto-focus next input
      if (value && index < 5) {
        inputRefs.current[index + 1]?.focus();
      }
    }

    // Auto-submit when all 6 digits are filled
    const complete = newDigits.every((d) => d !== '');
    if (complete) {
      submitCode(newDigits.join(''));
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const submitCode = async (code: string) => {
    setError('');
    setIsLoading(true);

    try {
      const result = await authApi.verifyOtp(phone, code);
      login(result.accessToken, result.refreshToken, result.user);
      router.replace('/');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Código incorrecto. Intenta de nuevo.',
      );
      // Clear digits and refocus
      setDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendTimer > 0) return;
    setError('');
    setResendTimer(60);
    try {
      await authApi.requestOtp(phone);
    } catch {
      setError('Error al reenviar el código');
    }
  };

  const maskedPhone = phone
    ? `${phone.slice(0, 4)}****${phone.slice(-4)}`
    : '';

  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex-1 flex flex-col px-8 pt-16 pb-8">
        {/* Back button */}
        <button
          onClick={() => router.back()}
          className="self-start mb-8 p-2 -ml-2 rounded-xl hover:bg-gray-100 transition-colors"
        >
          <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Verifica tu número
          </h1>
          <p className="text-gray-500">
            Ingresa el código de 6 dígitos enviado a{' '}
            <span className="font-medium text-gray-700">{maskedPhone}</span>
          </p>
        </div>

        {/* Dev mode hint */}
        {devCode && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
            <p className="text-xs text-amber-700">
              🛠️ <strong>Dev mode:</strong> Tu código es{' '}
              <span className="font-mono font-bold text-amber-900">{devCode}</span>
            </p>
          </div>
        )}

        {/* OTP Input */}
        <div className="flex gap-3 justify-center mb-6">
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(el) => { inputRefs.current[index] = el; }}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={digit}
              onChange={(e) => handleChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              disabled={isLoading}
              className={`w-12 h-14 text-center text-xl font-bold rounded-xl border-2 transition-all focus:outline-none focus:ring-0 ${
                digit
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                  : 'border-gray-200 bg-gray-50 text-gray-900'
              } ${
                error
                  ? 'border-red-300 bg-red-50'
                  : 'focus:border-indigo-500'
              } disabled:opacity-50`}
            />
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-center">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex items-center justify-center gap-2 mb-4 text-indigo-600">
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
            <span className="text-sm font-medium">Verificando...</span>
          </div>
        )}

        {/* Resend */}
        <div className="text-center mt-4">
          {resendTimer > 0 ? (
            <p className="text-sm text-gray-400">
              Reenviar código en{' '}
              <span className="font-medium text-gray-600">{resendTimer}s</span>
            </p>
          ) : (
            <button
              onClick={handleResend}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
            >
              Reenviar código
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Wrap in Suspense because useSearchParams() needs it in App Router
export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
        </div>
      }
    >
      <VerifyOtpContent />
    </Suspense>
  );
}

