'use client';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`skeleton ${className}`} />;
}

/** Card skeleton for provider/booking lists */
export function CardSkeleton() {
  return (
    <div className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-gray-100 animate-fade-in">
      <Skeleton className="w-12 h-12 rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-40" />
      </div>
      <Skeleton className="h-6 w-10 rounded-lg" />
    </div>
  );
}

/** List of card skeletons */
export function CardListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Grid skeleton for category buttons */
export function CategoryGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-4 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col items-center gap-2 p-3">
          <Skeleton className="w-14 h-14 rounded-2xl" />
          <Skeleton className="w-12 h-3" />
        </div>
      ))}
    </div>
  );
}

/** Full page loading skeleton */
export function PageSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50 p-5 pt-14 space-y-4 animate-fade-in">
      <Skeleton className="h-8 w-48 mb-6" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <div className="mt-8 space-y-3">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </div>
  );
}

