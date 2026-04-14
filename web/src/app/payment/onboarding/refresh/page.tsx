import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sesión expirada — Ubermench",
};

export default function OnboardingRefreshPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-b from-orange-50 to-white px-4">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-6">⏳</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">
          Tu sesión expiró
        </h1>
        <p className="text-gray-600 text-lg">
          Regresa a WhatsApp y dile a tu Chalán{" "}
          <strong>&quot;activar cobros&quot;</strong> para obtener un nuevo link.
        </p>
        <p className="text-gray-400 text-sm mt-8">
          Puedes cerrar esta página.
        </p>
      </div>
    </main>
  );
}
