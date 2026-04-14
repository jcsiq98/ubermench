import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cuenta configurada — Ubermench",
};

export default function OnboardingCompletePage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-b from-green-50 to-white px-4">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-6">🏦</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">
          ¡Tu cuenta está configurada!
        </h1>
        <p className="text-gray-600 text-lg">
          Regresa a WhatsApp y dile a tu Chalán que genere tu primer link de
          cobro.
        </p>
        <p className="text-gray-500 text-base mt-4">
          Ejemplo: &quot;Cóbrale 1,200 al señor Ramírez por instalación
          eléctrica&quot;
        </p>
        <p className="text-gray-400 text-sm mt-8">
          Puedes cerrar esta página.
        </p>
      </div>
    </main>
  );
}
