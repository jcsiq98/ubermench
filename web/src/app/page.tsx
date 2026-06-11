const WHATSAPP_URL = 'https://wa.me/5216565561222?text=hola';

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6 bg-gradient-to-b from-amber-50 to-white">
      <div className="text-center max-w-md">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Chalán</h1>
        <p className="text-gray-700 text-lg mb-2">
          Tu ayudante de negocio por WhatsApp.
        </p>
        <p className="text-gray-500 mb-8">
          Dile qué cobraste, qué gastaste o qué cita tienes. Él te lleva las
          cuentas, los clientes y los pendientes.
        </p>
        <a
          href={WHATSAPP_URL}
          className="inline-block bg-green-600 hover:bg-green-700 text-white font-semibold px-8 py-4 rounded-full text-lg transition-colors"
        >
          Mándale un WhatsApp
        </a>
        <p className="text-gray-400 text-sm mt-6">
          Escríbele &ldquo;hola&rdquo; y pruébalo con algo real de tu negocio.
        </p>
      </div>
    </main>
  );
}
