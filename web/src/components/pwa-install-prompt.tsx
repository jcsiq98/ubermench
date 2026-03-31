'use client';

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already installed as PWA
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window.navigator as any).standalone === true;
    setIsStandalone(standalone);

    if (standalone) return;

    // Check for iOS
    const ios =
      /iPad|iPhone|iPod/.test(navigator.userAgent) &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      !(window as any).MSStream;
    setIsIOS(ios);

    // Check if user dismissed before (don't nag)
    const dismissed = localStorage.getItem('handy_pwa_dismissed');
    if (dismissed) {
      const dismissedDate = new Date(dismissed);
      const daysSince = (Date.now() - dismissedDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) return; // Don't show for 7 days after dismissal
    }

    // Listen for the beforeinstallprompt event (Chrome/Edge/Android)
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Show after a brief delay so it doesn't appear immediately on page load
      setTimeout(() => setShowPrompt(true), 3000);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // For iOS, show manual instructions after delay
    if (ios) {
      setTimeout(() => setShowPrompt(true), 5000);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Register service worker
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          console.log('[PWA] Service worker registered:', reg.scope);
        })
        .catch((err) => {
          console.error('[PWA] Service worker registration failed:', err);
        });
    }
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        console.log('[PWA] App installed');
      }
      setDeferredPrompt(null);
    }
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('handy_pwa_dismissed', new Date().toISOString());
  };

  if (isStandalone || !showPrompt) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 safe-bottom animate-in slide-in-from-bottom duration-500">
      <div className="mx-auto max-w-[460px] bg-white rounded-2xl shadow-2xl border border-gray-100 p-4">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xl font-bold shrink-0">
            H
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-gray-800">
              Instalar Handy
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {isIOS
                ? 'Toca el botón compartir ↗ y luego "Agregar a pantalla de inicio"'
                : 'Agrega Handy a tu pantalla de inicio para acceso rápido'}
            </p>
          </div>

          {/* Close */}
          <button
            onClick={handleDismiss}
            className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-xs shrink-0 hover:bg-gray-200"
          >
            ✕
          </button>
        </div>

        {!isIOS && (
          <button
            onClick={handleInstall}
            className="w-full mt-3 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl text-sm font-semibold active:scale-95 transition-transform"
          >
            Instalar app
          </button>
        )}
      </div>
    </div>
  );
}

