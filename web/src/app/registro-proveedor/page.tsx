'use client';

import { useEffect, useState } from 'react';

// WhatsApp Business phone number (without +)
// Set via env var, fallback to empty
const WA_PHONE = process.env.NEXT_PUBLIC_WA_PHONE || '';
const WA_MESSAGE = 'Quiero registrarme como proveedor en Handy';
const WA_LINK = WA_PHONE
  ? `https://wa.me/${WA_PHONE}?text=${encodeURIComponent(WA_MESSAGE)}`
  : '';
const QR_API = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&color=4F46E5&data=${encodeURIComponent(WA_LINK)}`;

const STEPS = [
  {
    num: '1',
    icon: '💬',
    title: 'Envía un mensaje',
    desc: 'Toca el botón de WhatsApp abajo. Nuestro bot te guiará paso a paso.',
  },
  {
    num: '2',
    icon: '📝',
    title: 'Completa tus datos',
    desc: 'Nombre, servicios, experiencia y zonas de trabajo. Solo 5 preguntas, 2 minutos.',
  },
  {
    num: '3',
    icon: '🔔',
    title: 'Recibe trabajos',
    desc: 'Cuando un cliente te solicite, recibirás la notificación directo en tu WhatsApp.',
  },
];

const BENEFITS = [
  {
    icon: '📱',
    title: 'Sin descargar app',
    desc: 'Todo funciona por WhatsApp, la app que ya tienes.',
  },
  {
    icon: '💰',
    title: 'Gratis',
    desc: 'Sin cuota mensual ni comisiones ocultas.',
  },
  {
    icon: '⚡',
    title: 'Rápido',
    desc: 'Regístrate en 2 minutos. Empieza a recibir trabajos hoy.',
  },
  {
    icon: '🛡️',
    title: 'Seguro',
    desc: 'Verificamos la identidad de clientes y proveedores.',
  },
  {
    icon: '📍',
    title: 'En tu zona',
    desc: 'Tú eliges en qué colonias y ciudades trabajas.',
  },
  {
    icon: '⭐',
    title: 'Tu reputación',
    desc: 'Los clientes te califican. Mejor rating = más trabajos.',
  },
];

const SERVICES = [
  { icon: '🔧', name: 'Plomería' },
  { icon: '⚡', name: 'Electricidad' },
  { icon: '🧹', name: 'Limpieza' },
  { icon: '🌿', name: 'Jardinería' },
  { icon: '🎨', name: 'Pintura' },
  { icon: '🔑', name: 'Cerrajería' },
  { icon: '🔨', name: 'Reparaciones' },
  { icon: '📦', name: 'Mudanzas' },
];

export default function RegistroProveedorPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleWhatsAppClick = () => {
    if (WA_LINK) {
      window.open(WA_LINK, '_blank');
    } else {
      alert(
        'El número de WhatsApp no está configurado. Contacta al administrador.',
      );
    }
  };

  return (
    <div className="min-h-screen bg-white -mx-0">
      {/* ─── Hero ─────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-700 text-white px-6 pt-12 pb-16">
        {/* Decorative circles */}
        <div className="absolute top-[-60px] right-[-40px] w-48 h-48 bg-white/10 rounded-full" />
        <div className="absolute bottom-[-30px] left-[-20px] w-32 h-32 bg-white/5 rounded-full" />

        <div className="relative z-10">
          {/* Logo */}
          <div className="flex items-center gap-2 mb-8">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-xl">
              🔧
            </div>
            <span className="text-xl font-bold">Handy</span>
          </div>

          <h1 className="text-3xl font-extrabold leading-tight mb-3">
            Únete como
            <br />
            proveedor 🛠️
          </h1>
          <p className="text-indigo-100 text-base leading-relaxed mb-8">
            Recibe clientes directo en tu WhatsApp. Sin apps, sin complicaciones.
            Regístrate en 2 minutos.
          </p>

          {/* Primary CTA */}
          <button
            onClick={handleWhatsAppClick}
            className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-[#25D366] hover:bg-[#20BD5A] text-white font-bold text-lg rounded-2xl shadow-lg shadow-green-500/30 active:scale-[0.98] transition-all"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-6 h-6 fill-current"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            Registrarme por WhatsApp
          </button>
        </div>
      </section>

      {/* ─── Servicios ─────────────────────────────────── */}
      <section className="px-6 py-8">
        <h2 className="text-center text-sm font-semibold text-gray-400 uppercase tracking-wider mb-5">
          Servicios que puedes ofrecer
        </h2>
        <div className="flex flex-wrap justify-center gap-2">
          {SERVICES.map((s) => (
            <span
              key={s.name}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 rounded-full text-sm text-gray-600 font-medium"
            >
              {s.icon} {s.name}
            </span>
          ))}
        </div>
      </section>

      {/* ─── Cómo funciona ────────────────────────────── */}
      <section className="px-6 py-10 bg-gray-50">
        <h2 className="text-xl font-bold text-gray-800 text-center mb-8">
          ¿Cómo funciona?
        </h2>
        <div className="space-y-6">
          {STEPS.map((step, i) => (
            <div key={step.num} className="flex gap-4 items-start">
              <div className="shrink-0 w-12 h-12 rounded-2xl bg-indigo-100 flex items-center justify-center text-2xl">
                {step.icon}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-800 mb-1">
                  <span className="text-indigo-500 mr-1">Paso {step.num}.</span>
                  {step.title}
                </h3>
                <p className="text-sm text-gray-500 leading-relaxed">
                  {step.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Beneficios ───────────────────────────────── */}
      <section className="px-6 py-10">
        <h2 className="text-xl font-bold text-gray-800 text-center mb-8">
          ¿Por qué unirte?
        </h2>
        <div className="grid grid-cols-2 gap-4">
          {BENEFITS.map((b) => (
            <div
              key={b.title}
              className="p-4 rounded-2xl bg-white border border-gray-100 shadow-sm"
            >
              <span className="text-2xl mb-2 block">{b.icon}</span>
              <h3 className="font-semibold text-gray-800 text-sm mb-1">
                {b.title}
              </h3>
              <p className="text-xs text-gray-500 leading-relaxed">{b.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── QR Code ──────────────────────────────────── */}
      {WA_LINK && (
        <section className="px-6 py-10 bg-gray-50">
          <h2 className="text-xl font-bold text-gray-800 text-center mb-2">
            Escanea para comenzar
          </h2>
          <p className="text-sm text-gray-500 text-center mb-6">
            Abre la cámara de tu celular y apunta al código QR
          </p>
          <div className="flex justify-center">
            <div className="p-4 bg-white rounded-2xl shadow-sm border border-gray-100">
              {mounted && (
                <img
                  src={QR_API}
                  alt="QR Code para registrarse en Handy"
                  width={200}
                  height={200}
                  className="rounded-lg"
                />
              )}
            </div>
          </div>
          <p className="text-xs text-gray-400 text-center mt-4">
            O copia este link:{' '}
            <button
              onClick={() => {
                navigator.clipboard.writeText(WA_LINK);
                alert('¡Link copiado!');
              }}
              className="text-indigo-500 underline"
            >
              copiar link
            </button>
          </p>
        </section>
      )}

      {/* ─── Marketing / Ads Section ─────────────────── */}
      <section className="px-6 py-10">
        <div className="p-6 rounded-2xl bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100">
          <h2 className="text-lg font-bold text-gray-800 mb-2">
            📣 Para anuncios y marketing
          </h2>
          <p className="text-sm text-gray-600 leading-relaxed mb-4">
            Comparte esta página o el link de WhatsApp en tus campañas:
          </p>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-gray-600">
              <span className="text-blue-500">📘</span>
              <span>
                <strong>Facebook/Instagram Ads</strong> — Usa "Click to
                WhatsApp" como CTA
              </span>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <span className="text-green-500">📲</span>
              <span>
                <strong>WhatsApp Status</strong> — Comparte el link de esta página
              </span>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <span className="text-orange-500">📄</span>
              <span>
                <strong>Flyers / Tarjetas</strong> — Imprime el código QR
              </span>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <span className="text-red-500">🎥</span>
              <span>
                <strong>TikTok / Reels</strong> — "Busca Handy en WhatsApp"
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Final CTA ────────────────────────────────── */}
      <section className="px-6 py-10 bg-gradient-to-br from-indigo-600 to-purple-700 text-white">
        <h2 className="text-2xl font-bold text-center mb-2">
          ¿Listo para empezar?
        </h2>
        <p className="text-indigo-100 text-center text-sm mb-6">
          Miles de clientes están buscando tus servicios
        </p>
        <button
          onClick={handleWhatsAppClick}
          className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-[#25D366] hover:bg-[#20BD5A] text-white font-bold text-lg rounded-2xl shadow-lg shadow-green-500/30 active:scale-[0.98] transition-all"
        >
          <svg
            viewBox="0 0 24 24"
            className="w-6 h-6 fill-current"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
          Registrarme ahora
        </button>
        <p className="text-indigo-200 text-xs text-center mt-4">
          100% gratis · Solo necesitas WhatsApp · 2 minutos
        </p>
      </section>

      {/* ─── Footer ───────────────────────────────────── */}
      <footer className="px-6 py-6 text-center">
        <p className="text-xs text-gray-400">
          © {new Date().getFullYear()} Handy · Servicios a tu alcance
        </p>
      </footer>
    </div>
  );
}

