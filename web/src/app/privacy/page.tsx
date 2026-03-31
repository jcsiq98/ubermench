'use client';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Aviso de Privacidad
        </h1>
        <p className="text-sm text-gray-500 mb-8">
          Última actualización: 9 de marzo de 2026
        </p>

        <div className="bg-white rounded-2xl shadow-sm p-6 md:p-8 space-y-8">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              1. Responsable del Tratamiento
            </h2>
            <p className="text-gray-600 leading-relaxed">
              Handy Technologies, S.A.P.I. de C.V. (&quot;Handy&quot;), con
              domicilio en Ciudad de México, México, es responsable del
              tratamiento de sus datos personales conforme a la Ley Federal de
              Protección de Datos Personales en Posesión de los Particulares
              (LFPDPPP) y su Reglamento.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              2. Datos Personales que Recopilamos
            </h2>
            <p className="text-gray-600 leading-relaxed mb-3">
              Recopilamos los siguientes datos personales:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-600">
              <li>
                <strong>Datos de identificación:</strong> nombre, número
                telefónico, correo electrónico
              </li>
              <li>
                <strong>Datos de verificación (proveedores):</strong> fotografía
                de INE (frente y reverso), fotografía selfie para verificación
                facial
              </li>
              <li>
                <strong>Datos de ubicación:</strong> coordenadas GPS durante la
                prestación del servicio
              </li>
              <li>
                <strong>Datos de uso:</strong> historial de servicios,
                calificaciones, mensajes en la plataforma
              </li>
              <li>
                <strong>Datos financieros:</strong> información de pago (procesada
                por terceros certificados PCI DSS)
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              3. Finalidades del Tratamiento
            </h2>
            <h3 className="font-medium text-gray-800 mb-2">
              Finalidades primarias (necesarias):
            </h3>
            <ul className="list-disc pl-6 space-y-1 text-gray-600 mb-4">
              <li>Crear y gestionar su cuenta de usuario</li>
              <li>Verificar la identidad de proveedores de servicios</li>
              <li>Facilitar la conexión entre clientes y proveedores</li>
              <li>Procesar pagos y transacciones</li>
              <li>Proveer soporte al cliente</li>
              <li>Garantizar la seguridad de usuarios durante los servicios</li>
              <li>Cumplir con obligaciones legales</li>
            </ul>
            <h3 className="font-medium text-gray-800 mb-2">
              Finalidades secundarias (opcionales):
            </h3>
            <ul className="list-disc pl-6 space-y-1 text-gray-600">
              <li>Enviar notificaciones sobre promociones y nuevos servicios</li>
              <li>Realizar análisis estadísticos y de mercado</li>
              <li>Mejorar nuestros servicios mediante análisis de uso</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              4. Derechos ARCO
            </h2>
            <p className="text-gray-600 leading-relaxed mb-3">
              Usted tiene derecho a ejercer sus derechos de Acceso,
              Rectificación, Cancelación y Oposición (ARCO) respecto a sus datos
              personales. Para ejercerlos, puede:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-600">
              <li>
                Enviar un correo a{' '}
                <a
                  href="mailto:privacidad@handy.mx"
                  className="text-[var(--color-primary)] font-medium hover:underline"
                >
                  privacidad@handy.mx
                </a>{' '}
                con su solicitud
              </li>
              <li>
                Desde la app: Perfil → Configuración → &quot;Solicitar mis datos&quot; o
                &quot;Eliminar mi cuenta&quot;
              </li>
            </ul>
            <p className="text-gray-600 leading-relaxed mt-3">
              Su solicitud será atendida en un plazo máximo de 20 días hábiles.
              Le informaremos la determinación adoptada dentro de los 15 días
              hábiles siguientes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              5. Retención y Eliminación de Datos
            </h2>
            <ul className="list-disc pl-6 space-y-2 text-gray-600">
              <li>
                <strong>Fotografías de INE:</strong> eliminadas 90 días después de
                la aprobación del proveedor
              </li>
              <li>
                <strong>Solicitudes rechazadas:</strong> datos eliminados a los 30
                días
              </li>
              <li>
                <strong>Datos de ubicación GPS:</strong> retenidos solo durante la
                duración del servicio activo
              </li>
              <li>
                <strong>Historial de servicios:</strong> retenido mientras la
                cuenta esté activa
              </li>
              <li>
                <strong>Al eliminar su cuenta:</strong> datos personales eliminados
                en un plazo de 30 días, salvo obligaciones legales de retención
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              6. Transferencia de Datos
            </h2>
            <p className="text-gray-600 leading-relaxed">
              Sus datos podrán ser transferidos a los siguientes terceros para las
              finalidades indicadas:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-gray-600 mt-3">
              <li>
                Proveedores de verificación de identidad (Truora/MetaMap) para
                validación de documentos
              </li>
              <li>
                Procesadores de pago (Stripe/MercadoPago) para el procesamiento de
                transacciones
              </li>
              <li>
                Meta Platforms (WhatsApp Business API) para comunicaciones con
                proveedores
              </li>
              <li>
                Servicios de almacenamiento en la nube para el resguardo seguro de
                información
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              7. Medidas de Seguridad
            </h2>
            <p className="text-gray-600 leading-relaxed">
              Implementamos medidas de seguridad administrativas, técnicas y
              físicas para proteger sus datos personales, incluyendo:
              encriptación de datos sensibles, control de acceso basado en roles,
              monitoreo de accesos, y auditorías periódicas de seguridad.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              8. Uso de Cookies y Tecnologías de Rastreo
            </h2>
            <p className="text-gray-600 leading-relaxed">
              Utilizamos cookies estrictamente necesarias para el funcionamiento
              de la plataforma (autenticación, preferencias de sesión). No
              utilizamos cookies de publicidad de terceros.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              9. Cambios al Aviso de Privacidad
            </h2>
            <p className="text-gray-600 leading-relaxed">
              Nos reservamos el derecho de modificar este aviso de privacidad.
              Cualquier cambio será notificado a través de la plataforma y por
              correo electrónico al menos 5 días antes de su entrada en vigor.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              10. Contacto
            </h2>
            <p className="text-gray-600 leading-relaxed">
              Para cualquier duda o solicitud relacionada con este aviso de
              privacidad o el tratamiento de sus datos personales:
            </p>
            <div className="mt-3 p-4 bg-gray-50 rounded-xl text-gray-600">
              <p>
                <strong>Correo:</strong>{' '}
                <a
                  href="mailto:privacidad@handy.mx"
                  className="text-[var(--color-primary)]"
                >
                  privacidad@handy.mx
                </a>
              </p>
              <p className="mt-1">
                <strong>Teléfono:</strong> +52 (55) 1234-5678
              </p>
            </div>
          </section>
        </div>

        <p className="text-center text-sm text-gray-400 mt-8">
          Al usar Handy, usted acepta los términos de este aviso de privacidad.
        </p>
      </div>
    </div>
  );
}
