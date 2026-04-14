import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pago cancelado — Ubermench",
};

export default function PaymentCancelPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-white px-4">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-6">↩️</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">
          Pago cancelado
        </h1>
        <p className="text-gray-600 text-lg">
          No se realizó ningún cargo. Si necesitas pagar, pide un nuevo link al
          proveedor.
        </p>
        <p className="text-gray-400 text-sm mt-8">
          Puedes cerrar esta página.
        </p>
      </div>
    </main>
  );
}
