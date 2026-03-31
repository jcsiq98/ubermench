'use client';

import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../../../lib/auth-context';
import {
  bookingsApi,
  ratingsApi,
  type BookingSummary,
  type MyRatingResponse,
} from '../../../../lib/api';

function AnimatedStar({
  index,
  selected,
  hovered,
  onSelect,
  onHover,
}: {
  index: number;
  selected: boolean;
  hovered: boolean;
  onSelect: () => void;
  onHover: () => void;
}) {
  const isActive = selected || hovered;

  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={onHover}
      className={`text-5xl transition-all duration-200 ${
        isActive
          ? 'text-yellow-400 scale-110 drop-shadow-lg'
          : 'text-gray-200 scale-100'
      } hover:scale-125 active:scale-90`}
      aria-label={`${index + 1} estrellas`}
    >
      ★
    </button>
  );
}

const SCORE_LABELS: Record<number, string> = {
  1: '😞 Muy malo',
  2: '😐 Malo',
  3: '🙂 Regular',
  4: '😊 Bueno',
  5: '🤩 ¡Excelente!',
};

export default function RateBookingPage() {
  const router = useRouter();
  const params = useParams();
  const bookingId = params.id as string;
  const { isLoading: authLoading, isAuthenticated, user } = useAuth();

  const [booking, setBooking] = useState<BookingSummary | null>(null);
  const [existingRating, setExistingRating] = useState<MyRatingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [score, setScore] = useState(0);
  const [hoveredScore, setHoveredScore] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [bookingData, ratingData] = await Promise.all([
        bookingsApi.getById(bookingId),
        ratingsApi.getMyRating(bookingId),
      ]);
      setBooking(bookingData);
      setExistingRating(ratingData);

      // If already rated, show the existing rating
      if (ratingData.rated && ratingData.rating) {
        setScore(ratingData.rating.score);
        setComment(ratingData.rating.comment || '');
        setSubmitted(true);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error loading data';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/login');
      return;
    }
    if (isAuthenticated && bookingId) {
      loadData();
    }
  }, [authLoading, isAuthenticated, bookingId, loadData, router]);

  const handleSubmit = async () => {
    if (score === 0) return;
    setSubmitting(true);
    setError(null);

    try {
      await ratingsApi.rate(bookingId, {
        score,
        comment: comment.trim() || undefined,
      });
      setSubmitted(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al enviar calificación';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || !isAuthenticated) return null;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Cargando...</p>
        </div>
      </div>
    );
  }

  if (error && !booking) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
        <span className="text-5xl mb-4">😕</span>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">{error}</h2>
        <button
          onClick={() => router.back()}
          className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium mt-4"
        >
          ← Volver
        </button>
      </div>
    );
  }

  if (!booking) return null;

  const providerName = booking.provider?.name || 'Proveedor';

  // Success screen after rating
  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-sm border border-gray-100">
          <div className="text-6xl mb-4 animate-bounce">🎉</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">
            ¡Gracias por tu calificación!
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Tu opinión ayuda a mejorar la comunidad de Handy.
          </p>

          {/* Show the rating given */}
          <div className="flex items-center justify-center gap-1 mb-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <span
                key={i}
                className={`text-3xl ${i <= score ? 'text-yellow-400' : 'text-gray-200'}`}
              >
                ★
              </span>
            ))}
          </div>
          <p className="text-sm text-gray-600 mb-1">
            Calificaste a <span className="font-semibold">{providerName}</span>
          </p>
          {comment && (
            <p className="text-xs text-gray-400 italic mt-1">
              &ldquo;{comment}&rdquo;
            </p>
          )}

          <div className="mt-6 space-y-3">
            <button
              onClick={() => router.push(`/bookings/${bookingId}`)}
              className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold text-sm active:scale-95 transition-transform"
            >
              Ver detalles del servicio
            </button>
            <button
              onClick={() => router.push('/')}
              className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-colors"
            >
              Ir al inicio
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Rating form
  const activeScore = hoveredScore || score;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white px-5 pt-12 pb-5 border-b border-gray-100 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/bookings/${bookingId}`)}
            className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
          >
            ←
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-gray-800">Calificar servicio</h1>
            <p className="text-xs text-gray-400">
              {booking.category?.icon} {booking.category?.name}
            </p>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-sm border border-gray-100">
          {/* Provider avatar */}
          <div className="mb-4">
            {booking.provider?.avatarUrl ? (
              <img
                src={booking.provider.avatarUrl}
                alt={providerName}
                className="w-20 h-20 rounded-full object-cover bg-gray-100 mx-auto ring-4 ring-indigo-100"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-bold text-2xl mx-auto ring-4 ring-indigo-100">
                {providerName[0]}
              </div>
            )}
          </div>

          <h2 className="text-lg font-bold text-gray-800 mb-1">
            ¿Cómo estuvo el servicio?
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            Califica a <span className="font-medium">{providerName}</span>
          </p>

          {/* Stars */}
          <div
            className="flex items-center justify-center gap-2 mb-3"
            onMouseLeave={() => setHoveredScore(0)}
          >
            {[1, 2, 3, 4, 5].map((i) => (
              <AnimatedStar
                key={i}
                index={i}
                selected={i <= score}
                hovered={i <= hoveredScore}
                onSelect={() => setScore(i)}
                onHover={() => setHoveredScore(i)}
              />
            ))}
          </div>

          {/* Score label */}
          <div className="h-6 mb-6">
            {activeScore > 0 && (
              <p className="text-sm font-medium text-gray-600 animate-in fade-in">
                {SCORE_LABELS[activeScore]}
              </p>
            )}
          </div>

          {/* Comment */}
          <div className="mb-6">
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Deja un comentario (opcional)..."
              maxLength={500}
              rows={3}
              className="w-full px-4 py-3 bg-gray-50 rounded-xl text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
            <p className="text-xs text-gray-400 text-right mt-1">
              {comment.length}/500
            </p>
          </div>

          {/* Error message */}
          {error && (
            <p className="text-sm text-red-500 mb-4">{error}</p>
          )}

          {/* Submit button */}
          <button
            onClick={handleSubmit}
            disabled={score === 0 || submitting}
            className="w-full py-3.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-semibold text-sm shadow-lg shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-transform"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Enviando...
              </span>
            ) : (
              'Enviar calificación'
            )}
          </button>

          {/* Skip */}
          <button
            onClick={() => router.push(`/bookings/${bookingId}`)}
            className="w-full py-3 text-gray-400 text-sm mt-3 hover:text-gray-600 transition-colors"
          >
            Omitir por ahora
          </button>
        </div>
      </div>
    </div>
  );
}

