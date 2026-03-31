'use client';

import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../../lib/auth-context';
import {
  providersApi,
  type ProviderDetail,
  type Review,
} from '../../../lib/api';

function StarRating({ score, size = 'sm' }: { score: number; size?: 'sm' | 'lg' }) {
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    stars.push(
      <span
        key={i}
        className={`${size === 'lg' ? 'text-xl' : 'text-sm'} ${
          i <= score ? 'text-yellow-400' : 'text-gray-200'
        }`}
      >
        ★
      </span>,
    );
  }
  return <div className="flex items-center gap-0.5">{stars}</div>;
}

function ReviewCard({ review }: { review: Review }) {
  const date = new Date(review.createdAt);
  const timeAgo = getTimeAgo(date);

  return (
    <div className="p-4 bg-white rounded-2xl border border-gray-100">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {review.customerAvatar ? (
            <img
              src={review.customerAvatar}
              alt=""
              className="w-8 h-8 rounded-full object-cover bg-gray-100"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 flex items-center justify-center text-white text-xs font-bold">
              {review.customerName[0]}
            </div>
          )}
          <div>
            <p className="text-sm font-medium text-gray-800">
              {review.customerName}
            </p>
            <p className="text-[10px] text-gray-400">{timeAgo}</p>
          </div>
        </div>
        <StarRating score={review.score} />
      </div>
      {review.comment && (
        <p className="text-sm text-gray-600 leading-relaxed">
          &ldquo;{review.comment}&rdquo;
        </p>
      )}
    </div>
  );
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return `Hace ${diffDays} días`;
  if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)} semanas`;
  if (diffDays < 365) return `Hace ${Math.floor(diffDays / 30)} meses`;
  return `Hace ${Math.floor(diffDays / 365)} años`;
}

export default function ProviderProfilePage() {
  const router = useRouter();
  const params = useParams();
  const providerId = params.id as string;
  const { isLoading: authLoading, isAuthenticated } = useAuth();

  const [provider, setProvider] = useState<ProviderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [moreReviews, setMoreReviews] = useState<Review[]>([]);
  const [reviewPage, setReviewPage] = useState(1);
  const [hasMoreReviews, setHasMoreReviews] = useState(false);
  const [loadingMoreReviews, setLoadingMoreReviews] = useState(false);

  const loadProvider = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await providersApi.getDetail(providerId);
      setProvider(data);
      // Check if there might be more reviews
      setHasMoreReviews(data.ratingCount > data.reviews.length);
    } catch (err) {
      console.error('Failed to load provider:', err);
      setError('No se pudo cargar el perfil del proveedor');
    } finally {
      setLoading(false);
    }
  }, [providerId]);

  const loadMoreReviews = async () => {
    if (loadingMoreReviews) return;
    setLoadingMoreReviews(true);
    try {
      const nextPage = reviewPage + 1;
      const res = await providersApi.getReviews(providerId, nextPage);
      setMoreReviews((prev) => [...prev, ...res.data]);
      setReviewPage(nextPage);
      setHasMoreReviews(nextPage < res.totalPages);
    } catch (err) {
      console.error('Failed to load reviews:', err);
    } finally {
      setLoadingMoreReviews(false);
    }
  };

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (isAuthenticated && providerId) {
      loadProvider();
    }
  }, [isAuthenticated, providerId, loadProvider]);

  if (authLoading || !isAuthenticated) return null;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Skeleton header */}
        <div className="bg-white px-5 pt-12 pb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-gray-100 animate-pulse" />
            <div className="h-5 w-32 bg-gray-100 rounded animate-pulse" />
          </div>
          <div className="flex flex-col items-center gap-3">
            <div className="w-24 h-24 rounded-full bg-gray-100 animate-pulse" />
            <div className="h-5 w-40 bg-gray-100 rounded animate-pulse" />
            <div className="h-4 w-28 bg-gray-100 rounded animate-pulse" />
            <div className="h-3 w-full bg-gray-100 rounded animate-pulse mt-2" />
            <div className="h-3 w-4/5 bg-gray-100 rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !provider) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
        <span className="text-5xl mb-4">😕</span>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">
          {error || 'Proveedor no encontrado'}
        </h2>
        <button
          onClick={() => router.back()}
          className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium mt-4"
        >
          ← Volver
        </button>
      </div>
    );
  }

  const memberSinceDate = new Date(provider.memberSince);
  const memberMonths = Math.floor(
    (Date.now() - memberSinceDate.getTime()) / (1000 * 60 * 60 * 24 * 30),
  );
  const memberText =
    memberMonths < 1
      ? 'Nuevo en Handy'
      : memberMonths < 12
        ? `${memberMonths} meses en Handy`
        : `${Math.floor(memberMonths / 12)} año${Math.floor(memberMonths / 12) > 1 ? 's' : ''} en Handy`;

  const allReviews = [...(provider.reviews || []), ...moreReviews];

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Profile Header */}
      <div className="bg-white px-5 pt-12 pb-6 shadow-sm">
        {/* Back button */}
        <button
          onClick={() => router.back()}
          className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors mb-4"
        >
          ←
        </button>

        <div className="flex flex-col items-center text-center">
          {/* Avatar */}
          {provider.avatarUrl ? (
            <img
              src={provider.avatarUrl}
              alt={provider.name || ''}
              className="w-24 h-24 rounded-full object-cover bg-gray-100 mb-3 ring-4 ring-indigo-100"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-bold text-3xl mb-3 ring-4 ring-indigo-100">
              {(provider.name || '?')[0]}
            </div>
          )}

          {/* Name + Verified */}
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold text-gray-800">{provider.name}</h1>
            {provider.isVerified && (
              <span className="text-sm" title="Proveedor verificado">
                ✅
              </span>
            )}
          </div>

          {/* Rating */}
          <div className="flex items-center gap-2 mb-3">
            <StarRating score={Math.round(provider.ratingAverage)} size="lg" />
            <span className="text-lg font-bold text-gray-800">
              {provider.ratingAverage.toFixed(1)}
            </span>
            <span className="text-sm text-gray-400">
              ({provider.ratingCount} reseñas)
            </span>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-6 text-center">
            <div>
              <p className="text-xl font-bold text-gray-800">
                {provider.totalJobs}
              </p>
              <p className="text-xs text-gray-500">Trabajos</p>
            </div>
            <div className="w-px h-8 bg-gray-200" />
            <div>
              <p className="text-xl font-bold text-gray-800">
                {provider.ratingAverage.toFixed(1)}
              </p>
              <p className="text-xs text-gray-500">Rating</p>
            </div>
            <div className="w-px h-8 bg-gray-200" />
            <div>
              <p className="text-sm font-bold text-gray-800">
                {memberText}
              </p>
              <p className="text-xs text-gray-500">Miembro</p>
            </div>
          </div>

          {/* Availability badge */}
          <div className="mt-3">
            {provider.isAvailable ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 text-green-600 text-xs font-medium">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                Disponible ahora
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 text-gray-500 text-xs font-medium">
                <span className="w-2 h-2 rounded-full bg-gray-400" />
                No disponible
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Content sections */}
      <div className="px-5 py-5 space-y-5">
        {/* Bio */}
        <section className="bg-white rounded-2xl p-4 border border-gray-100">
          <h2 className="text-sm font-semibold text-gray-800 mb-2">
            Acerca de mí
          </h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            {provider.bio}
          </p>
        </section>

        {/* Services */}
        <section className="bg-white rounded-2xl p-4 border border-gray-100">
          <h2 className="text-sm font-semibold text-gray-800 mb-3">
            Servicios que ofrezco
          </h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(provider.serviceNames || {}).map(([slug, name]) => (
              <span
                key={slug}
                className="px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-600 text-xs font-medium"
              >
                {name}
              </span>
            ))}
          </div>
        </section>

        {/* Service Zones */}
        {provider.zones && provider.zones.length > 0 && (
          <section className="bg-white rounded-2xl p-4 border border-gray-100">
            <h2 className="text-sm font-semibold text-gray-800 mb-3">
              📍 Zonas de servicio
            </h2>
            <div className="flex flex-wrap gap-2">
              {provider.zones.map((zone) => (
                <span
                  key={zone.id}
                  className="px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium"
                >
                  {zone.name}
                </span>
              ))}
            </div>
            {provider.zones.length > 0 && (
              <p className="text-[11px] text-gray-400 mt-2">
                {provider.zones[0].city}
              </p>
            )}
          </section>
        )}

        {/* Reviews */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-800">
              Reseñas de clientes ({provider.ratingCount})
            </h2>
          </div>

          {allReviews.length === 0 ? (
            <div className="bg-white rounded-2xl p-6 border border-gray-100 text-center">
              <span className="text-3xl mb-2 block">📝</span>
              <p className="text-sm text-gray-500">
                Aún no hay reseñas para este proveedor
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {allReviews.map((review) => (
                <ReviewCard key={review.id} review={review} />
              ))}

              {hasMoreReviews && (
                <button
                  onClick={loadMoreReviews}
                  disabled={loadingMoreReviews}
                  className="w-full py-3 text-center text-sm text-indigo-600 font-medium bg-white rounded-2xl border border-gray-100 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  {loadingMoreReviews
                    ? 'Cargando...'
                    : 'Ver más reseñas'}
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Fixed bottom CTA buttons */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-5 py-3 safe-bottom">
        <div className="mx-auto max-w-[480px] flex gap-3">
          <button
            onClick={() => router.push(`/book/${provider.id}`)}
            className="flex-1 py-3.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-semibold text-sm shadow-lg shadow-indigo-200 active:scale-95 transition-transform"
          >
            Solicitar Servicio
          </button>
          <button
            onClick={() => {
              // TODO: M6 - Navigate to chat
            }}
            className="px-5 py-3.5 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-colors active:scale-95"
          >
            💬 Chat
          </button>
        </div>
      </div>
    </div>
  );
}

