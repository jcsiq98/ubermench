# 💰 Handy — Análisis de Costos de Infraestructura

> Este documento se actualiza conforme crece la app.
> Última actualización: Febrero 2026

---

## 📊 Resumen ejecutivo

| Escenario | Costo mensual estimado |
|---|---|
| **Desarrollo / Demo** (tráfico mínimo) | **$0 — $5 USD** |
| **Lanzamiento** (100 usuarios, 20 proveedores) | **$5 — $15 USD** |
| **Crecimiento** (1,000 usuarios, 100 proveedores) | **$25 — $60 USD** |
| **Escala** (10,000 usuarios, 500 proveedores) | **$100 — $300 USD** |

---

## 🏗️ Infraestructura actual (MVP 1 — Local)

| Componente | Servicio | Costo |
|---|---|---|
| PostgreSQL | Embebido (local) | Gratis |
| Redis | In-memory fallback (local) | Gratis |
| Backend | localhost:3000 | Gratis |
| Frontend | localhost:3001 | Gratis |
| WhatsApp API | Meta Cloud API (sandbox) | Gratis |
| Túnel (webhook) | ngrok (free tier) | Gratis |
| **Total actual** | | **$0 USD/mes** |

---

## ☁️ Infraestructura de producción (MVP 2 — Deploy)

### Frontend — Vercel

| Concepto | Free tier | Pro ($20/mes) |
|---|---|---|
| Deploys | Ilimitados | Ilimitados |
| Bandwidth | 100 GB/mes | 1 TB/mes |
| Serverless functions | 100 GB-hrs | 1000 GB-hrs |
| Dominios custom | ✅ | ✅ |
| Analytics | Básico | Avanzado |

**Para Handy**: El tier gratis es suficiente hasta ~5,000 usuarios/mes.

| Escenario | Costo |
|---|---|
| Demo / desarrollo | **$0** |
| Hasta 5,000 usuarios/mes | **$0** |
| Más de 5,000 usuarios/mes | **$20/mes** |

### Backend — Railway

| Concepto | Trial | Hobby ($5/mes) | Pro ($20/mes) |
|---|---|---|---|
| Crédito incluido | $5 una vez | $5/mes | $20/mes |
| vCPU | Compartido | Compartido | 8 vCPU |
| RAM | 512 MB | 512 MB | 8 GB |
| Ejecución | $0.000231/min | $0.000231/min | $0.000231/min |

**Para Handy**: Con el plan Hobby ($5/mes), el backend corre 24/7 por ~$3.30/mes en compute. El resto del crédito cubre tráfico.

| Escenario | Costo |
|---|---|
| Demo (pocas horas al día) | **$0 — $2** |
| Producción 24/7 | **$5/mes** |
| Alto tráfico (API intensiva) | **$10 — $20/mes** |

### PostgreSQL — Neon

| Concepto | Free | Launch ($19/mes) |
|---|---|---|
| Almacenamiento | 512 MB | 10 GB |
| Compute | 0.25 vCPU | 1 vCPU |
| Branches | 10 | 50 |
| Auto-suspend | Sí (después de 5 min) | Configurable |

**Para Handy**: El tier gratis soporta fácilmente 1,000 usuarios y 10,000 bookings. Auto-suspend reduce costos en etapa temprana.

| Escenario | Costo |
|---|---|
| Hasta 512 MB de datos (~10K usuarios) | **$0** |
| Más almacenamiento / queries pesadas | **$19/mes** |

### Redis — Upstash

| Concepto | Free | Pay-as-you-go |
|---|---|---|
| Requests | 10,000/día | $0.2 por 100K req |
| Almacenamiento | 256 MB | $0.25 por GB |
| Conexiones | 1,000 | Ilimitadas |

**Para Handy**: Redis se usa para sesiones de WhatsApp y caché. 10K req/día es suficiente para ~200 usuarios activos.

| Escenario | Costo |
|---|---|
| Demo / pocos usuarios | **$0** |
| 200+ usuarios activos/día | **$1 — $5/mes** |

---

## 📱 WhatsApp Cloud API — Meta

### Sandbox vs Producción

| | 🧪 Sandbox (desarrollo) | 🚀 Producción |
|---|---|---|
| Quién puede recibir mensajes | Solo números agregados manualmente (~5) | **Cualquier persona** |
| Cómo agregar números | Manual en developers.facebook.com | Automático — quien escriba, recibe |
| Costo | Gratis | Por conversación (ver abajo) |
| Requisito | Solo token de developer | Verificación de negocio con Meta |
| Ideal para | Pruebas internas, MVP cerrado | Lanzamiento público |

### Cómo pasar a producción (4 pasos)

1. **Crear Meta Business Account** → [business.facebook.com](https://business.facebook.com)
2. **Verificar tu negocio** → RFC, acta constitutiva, factura de servicios, o dominio web
3. **Registrar un número dedicado** → Un número que NO esté en WhatsApp personal (puede ser Twilio, segundo chip, etc.)
4. **Solicitar acceso a producción** → developers.facebook.com → Tu App → WhatsApp → API Setup → "Request Production Access" (1-3 días hábiles)

> ✅ Una vez aprobado, cualquier persona puede mandar mensaje al número de Handy y recibir respuesta automática. No más agregar números manualmente.

### Modelo de precios

Meta cobra por **conversación**, no por mensaje. Una conversación dura 24 horas desde el primer mensaje.

| Tipo de conversación | Costo (México) |
|---|---|
| **User-initiated** (el usuario escribe primero) | ~$0.0085 USD |
| **Business-initiated** (Handy envía primero) | ~$0.0351 USD |
| **Service** (dentro de ventana de 24h) | **Gratis** |
| **Free tier** (primeras 1,000/mes) | **Gratis** |

**Para Handy**:
- Notificación de nuevo booking = business-initiated ($0.035)
- Respuesta del proveedor = service (gratis, dentro de 24h)
- Chat durante el booking = service (gratis)
- Onboarding completo de un proveedor = 1 conversación ($0.0085 si el proveedor escribe primero)

| Escenario | Conversaciones/mes | Costo |
|---|---|---|
| Demo (sandbox) | 10-50 | **$0** (sandbox gratis) |
| 100 bookings/mes | ~100 | **$0** (free tier cubre 1,000) |
| 1,000 bookings/mes | ~1,000 | **$0 — $3.50** |
| 5,000 bookings/mes | ~5,000 | **$140/mes** |
| 10,000 bookings/mes | ~10,000 | **$315/mes** |

> ⚠️ Los costos de WhatsApp escalan linealmente. A alto volumen, es el mayor gasto.
> Optimización: agrupar notificaciones y usar la ventana de 24h lo más posible.

---

## 📸 Almacenamiento de fotos (Verificación de identidad)

### Cloudinary

| Concepto | Free | Plus ($89/mes) |
|---|---|---|
| Almacenamiento | 25K transformaciones | 225K |
| Bandwidth | 25 GB | 225 GB |
| Espacio | ~10 GB | ~200 GB |

**Para Handy**: Cada proveedor sube 3 fotos (~3 MB total). Con 1,000 proveedores = ~3 GB.

| Escenario | Costo |
|---|---|
| Hasta ~1,000 proveedores | **$0** |
| 1,000 — 5,000 proveedores | **$0 — $10/mes** (S3 es más barato) |

### Alternativa: Supabase Storage

| Concepto | Free | Pro ($25/mes) |
|---|---|---|
| Almacenamiento | 1 GB | 100 GB |
| Bandwidth | 2 GB | 250 GB |

---

## 🗺️ Geocoding / Mapas

| Servicio | Free tier | Costo después |
|---|---|---|
| **Nominatim (OSM)** | Ilimitado (self-hosted) | Gratis siempre |
| **Mapbox** | 100K req/mes | $0.75/1K req |
| **Google Maps** | $200 crédito/mes (~28K req) | $5/1K req |

**Recomendación**: Nominatim (OpenStreetMap) para reverse geocoding. Gratis, sin API key, datos buenos para México.

| Escenario | Costo |
|---|---|
| Cualquier escenario con Nominatim | **$0** |
| Google Maps si se necesita precisión premium | **$0 — $5/mes** |

---

## 🔍 Verificación facial (futuro)

| Servicio | Costo por verificación | Free tier |
|---|---|---|
| **AWS Rekognition** | $0.001/comparación | 5,000/mes (primer año) |
| **Metamap (LATAM)** | $1 — $2/verificación | Demo gratis |
| **Truora** | $0.50 — $1/verificación | Primeras 5 gratis |
| **Manual (admin)** | $0 (tiempo humano) | ∞ |

**Recomendación para MVP**: Revisión manual por admin ($0). Migrar a AWS Rekognition cuando pasen de 50 proveedores/mes.

---

## 📋 Costo total por escenario

### 🟢 Demo / Desarrollo (ahora)

| Servicio | Costo |
|---|---|
| Vercel (frontend) | $0 |
| Railway (backend) | $0 — $5 |
| Neon (PostgreSQL) | $0 |
| Upstash (Redis) | $0 |
| WhatsApp API | $0 |
| Cloudinary (fotos) | $0 |
| Geocoding | $0 |
| **Total** | **$0 — $5/mes** |

### 🟡 Lanzamiento (100 usuarios, 20 proveedores)

| Servicio | Costo |
|---|---|
| Vercel | $0 |
| Railway | $5 |
| Neon | $0 |
| Upstash | $0 |
| WhatsApp | $0 (free tier) |
| Cloudinary | $0 |
| Dominio | $1/mes (~$12/año) |
| **Total** | **$6 — $10/mes** |

### 🟠 Crecimiento (1,000 usuarios, 100 proveedores, 500 bookings/mes)

| Servicio | Costo |
|---|---|
| Vercel | $0 |
| Railway | $5 — $10 |
| Neon | $0 |
| Upstash | $2 |
| WhatsApp | $0 (dentro del free tier) |
| Cloudinary | $0 |
| Dominio | $1 |
| **Total** | **$8 — $15/mes** |

### 🔴 Escala (10,000 usuarios, 500 proveedores, 5,000 bookings/mes)

| Servicio | Costo |
|---|---|
| Vercel | $20 |
| Railway | $20 |
| Neon | $19 |
| Upstash | $5 |
| WhatsApp | $140 |
| Cloudinary / S3 | $10 |
| Dominio | $1 |
| Verificación facial | $50 — $100 |
| **Total** | **$265 — $315/mes** |

---

## 💡 Oportunidades de optimización

1. **WhatsApp es el mayor costo a escala** → Considerar notificaciones push (gratis) como alternativa para casos menos urgentes
2. **Fotos de verificación** → Usar S3 en vez de Cloudinary cuando pasen de 1,000 proveedores (~$0.023/GB vs gratis pero limitado)
3. **PostgreSQL** → Neon auto-suspends en free tier, lo que puede causar cold starts. Si es problema, migrar a Supabase o Railway Postgres
4. **Redis** → Si Upstash se queda corto, Railway incluye Redis como add-on por ~$5/mes
5. **Railway → VPS** → A escala, un VPS de $20/mes (Hetzner, DigitalOcean) corre todo más barato que servicios separados

---

## 📈 Tracking de costos

| Fecha | Evento | Costo nuevo | Total mensual |
|---|---|---|---|
| Feb 2026 | MVP 1 — Local | $0 | $0 |
| _Próximo_ | MVP 2 — Deploy | ~$5 | ~$5 |
| | | | |

> Actualizar esta tabla cada vez que se agregue un servicio nuevo.

