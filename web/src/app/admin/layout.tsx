'use client';

import { useAuth } from '../../lib/auth-context';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';

const NAV_ITEMS = [
  { href: '/admin', label: 'Dashboard', icon: '📊' },
  { href: '/admin/applications', label: 'Solicitudes', icon: '📋' },
  { href: '/admin/providers', label: 'Proveedores', icon: '👷' },
  { href: '/admin/reports', label: 'Reportes', icon: '🚨' },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && (!isAuthenticated || user?.role !== 'ADMIN')) {
      router.replace('/');
    }
  }, [isLoading, isAuthenticated, user, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAuthenticated || user?.role !== 'ADMIN') {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-indigo-600 text-white px-4 py-3 sticky top-0 z-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold">Handy</span>
            <span className="text-xs bg-indigo-800 px-2 py-0.5 rounded-full">Admin</span>
          </div>
          <Link href="/" className="text-xs text-indigo-200 hover:text-white">
            Ir al sitio &rarr;
          </Link>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b px-4 py-2 flex gap-1 overflow-x-auto">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === '/admin'
              ? pathname === '/admin'
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Content */}
      <main className="p-4">{children}</main>
    </div>
  );
}
