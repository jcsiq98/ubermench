import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "../lib/auth-context";
import { ErrorBoundary } from "../components/ui/error-boundary";


const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Handy — Servicios a tu alcance",
  description:
    "Conectamos a jóvenes con los mejores prestadores de servicios del hogar. Plomería, electricidad, limpieza y más.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Handy",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#6366f1",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.svg" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Handy" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="format-detection" content="telephone=no" />
      </head>
      <body
        className={`${inter.variable} font-sans antialiased bg-gray-50 text-gray-900`}
      >
        {/* Mobile container — max 480px centered */}
        <div className="mx-auto max-w-[480px] min-h-screen bg-white shadow-sm">
          <ErrorBoundary>
            <AuthProvider>
              {children}
            </AuthProvider>
          </ErrorBoundary>
        </div>
      </body>
    </html>
  );
}
