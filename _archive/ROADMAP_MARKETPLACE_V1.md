# Handy — Roadmap

> **Estado actual**: Fase 5 completada (Push Notifications FCM, perfil de usuario completo, PWA proveedor mejorada). Fase 4 saltada.
> **Objetivo**: Plataforma dominante de servicios a domicilio en Mexico y LATAM.
> **Modelo**: App para clientes + WhatsApp para proveedores + capa financiera como moat.
> **Stack**: Next.js + NestJS + PostgreSQL + Redis + WhatsApp Cloud API
> **Mercado**: $4.46B home services Mexico (2024), $180B LATAM TAM. Online on-demand
> crece a CAGR 15.3%. No hay plataforma dominante regional.

---

## Vision del Producto

Handy es un marketplace two-sided con una ventaja competitiva asimetrica:
los clientes usan una app moderna; los proveedores operan 100% via WhatsApp
(93% de penetracion en Mexico). Esta decision no es un compromiso — es la
estrategia que reduce la friccion de onboarding a casi cero en un mercado
donde el 55% de la economia es informal.

El moat a largo plazo no es el marketplace — es la capa de servicios
financieros construida sobre datos de transacciones que ningun banco
tradicional puede replicar.

```
Fase 1-3: Construir el marketplace confiable
Fase 4-5: Monetizar y generar datos de transacciones
Fase 6-7: Crecer y acumular historial crediticio
Fase 8:   Lanzar servicios financieros (el verdadero negocio)
Fase 9:   Expandir regionalmente
Fase 10:  App nativa (solo despues de PMF comprobado)
```

---

## Fase 1: Foundation (100%) ✅

Producto funcional en produccion con experiencia completa para ambos lados
del marketplace: app del cliente con ubicacion inteligente + interfaz rica
de WhatsApp para proveedores + modo proveedor en la app.

### 1.1 Deploy (~80%)

- [x] PostgreSQL en produccion (Neon)
- [x] Redis en produccion (Upstash)
- [x] Backend en Railway (Dockerfile, migraciones, seed)
- [x] Frontend en Vercel
- [x] Webhook de WhatsApp en produccion
- [ ] Dominio personalizado

### 1.2 Onboarding via WhatsApp (100%)

- [x] Estados de onboarding en handler de WhatsApp
- [x] Flujo conversacional: Nombre → Servicios → Experiencia → Ciudad → Zonas → Bio
- [x] Schema de Prisma (ProviderApplication, VerificationStatus)
- [x] Endpoint para fotos de verificacion
- [x] Resumen al proveedor al completar

### 1.3 Verificacion Basica (~100%)

- [x] Pagina `/verify/:token` mobile-first (INE frente/reverso + selfie)
- [x] Almacenamiento en Cloudinary
- [x] Liveness detection basico
- [x] Notificar resultado por WhatsApp (aprobado/rechazado)

### 1.4 Zonas de Servicio (~90%)

- [x] Schema: ServiceZone, ProviderServiceZone, coordenadas
- [x] Seed de zonas (CDMX, MTY, GDL, Juarez, Puebla, etc.)
- [x] Zonas via WhatsApp durante onboarding
- [x] API para gestionar zonas
- [ ] Pagina web de seleccion de zonas

### 1.5 Ubicacion y Busqueda (~100%)

- [x] GPS del cliente + reverse geocoding
- [x] API de busqueda con filtro por zona y distancia
- [x] Zonas en perfil del proveedor
- [x] Conectar filtro de distancia en frontend (API lo soporta, UI no lo usa)
- [x] Distancia aproximada en tarjetas de proveedor

### 1.6 Ubicacion Inteligente en Booking (tipo Uber/Rappi)

Actualmente el cliente escribe su direccion a mano en un input de texto.
El backend soporta lat/lng pero el frontend nunca los envia.
Esto debe funcionar como Uber: GPS automatico + autocompletar + mapa.

- [x] Integrar Google Places API (autocomplete):
  - Input con autocompletar: cliente escribe "Col. Roma" → sugerencias
  - Al seleccionar: guardar address, lat, lng automaticamente
  - Fallback: input manual si Google falla o usuario prefiere
- [x] Mapa de confirmacion:
  - Mostrar pin en mapa (Static Maps) con la ubicacion seleccionada
  - Reverse geocoding del pin final para confirmar direccion
- [x] "Usar mi ubicacion actual" (boton GPS):
  - navigator.geolocation → reverse geocode → rellenar address + lat/lng
- [x] Enviar lat/lng al backend al crear booking (ya soportado en el DTO)
- [x] Direcciones guardadas:
  - "Mi casa", "Oficina" — seleccionar con un tap en vez de escribir cada vez
  - Modelo `SavedAddress` en Prisma (userId, label, address, lat, lng)
  - CRUD API: GET/POST/PUT/DELETE /api/addresses

### 1.7 Navegacion para el Proveedor (tipo Uber)

Cuando el proveedor acepta un trabajo, debe recibir la ubicacion y poder
navegar con un tap — no un texto con la direccion escrita.

- [x] Al aceptar booking: enviar ubicacion por WhatsApp como location message
  (WhatsApp Cloud API soporta tipo `location` con lat, lng, name, address)
- [x] Incluir link clickeable de Google Maps en el mensaje:
  `https://maps.google.com/?q={lat},{lng}`
- [x] Link de Waze como alternativa: `https://waze.com/ul?ll={lat},{lng}&navigate=yes`
- [x] En la notificacion de booking, mostrar distancia aproximada del proveedor al cliente
- [x] Si el proveedor usa la app: boton "Navegar" que abre Google Maps/Waze nativo

### 1.8 WhatsApp UI Interactiva para Proveedores

La interfaz actual es texto plano con comandos basicos. WhatsApp Business API
soporta botones interactivos, listas y menus — hay que usarlos.

**Menu principal (al escribir "menu"):**

- [x] Enviar menu con botones interactivos (WhatsApp interactive message type):
  ```
  📋 *Menu Principal*

  [📊 Mi Dashboard]  [📝 Mis Trabajos]  [⚙️ Mi Cuenta]
  ```
- [x] Cada boton lleva a un sub-menu con opciones

**Dashboard del proveedor:**

- [x] Resumen de stats via WhatsApp:
  - Trabajos completados (semana/mes/total)
  - Rating promedio + numero de resenas
  - Trabajos activos
- [x] Comando: "dashboard" o boton del menu

**Mis Trabajos:**

- [x] Lista de trabajos recientes (WhatsApp list message):
  - Ultimos 10 trabajos con status, fecha, monto
  - Detalle via interactive list
- [x] Trabajos pendientes / en progreso
- [x] Historial de trabajos completados

**Mi Cuenta:**

- [x] Ver perfil completo (nombre, bio, zonas, servicios, verificacion)
- [x] Editar perfil via WhatsApp (nombre, bio, toggle disponibilidad)
- [x] Ver tier actual + requisitos para subir

**Notificaciones de nuevo trabajo (mejoradas):**

- [x] Mensaje interactivo con botones en vez de texto:
  - Notificacion con distancia + botones [Aceptar] [Rechazar]
- [x] Al aceptar: enviar location message + links Google Maps/Waze
- [x] Confirmacion de status con botones: [🔧 Empezar] [✅ Completar] [💬 Chatear]

**Ganancias:**

- [x] Resumen semanal automatico (cron cada domingo 10am):
  - Trabajos de la semana, rating, ganancias, mejor dia
  - Solo se envia a proveedores con al menos 1 trabajo completado

### 1.9 Modo Proveedor en la App

Dashboard web completo para proveedores que prefieren la app sobre WhatsApp.
Sincronizado con WhatsApp — acciones en cualquier canal se reflejan en ambos.

**Deteccion automatica:**

- [x] Al login, si user.role === PROVIDER → redirigir a `/provider`
- [x] Navbar diferente para proveedores (Dashboard, Trabajos, Ganancias, Perfil)
- [x] Toggle para cambiar entre modo cliente/proveedor si tiene ambos roles

**Dashboard del proveedor (`/provider`):**

- [x] KPIs en cards: trabajos completados, trabajos del mes, rating, semana
- [x] Grafica de trabajos ultimas 4 semanas
- [x] Trabajos pendientes de respuesta (aceptar/rechazar desde la app)
- [x] Trabajos activos en progreso
- [x] Progreso al siguiente tier (barra de progreso)

**Gestion de trabajos (`/provider/jobs`):**

- [x] Lista de trabajos con tabs: Pendientes | Activos | Completados | Rechazados
- [x] Detalle de trabajo: datos del cliente, direccion, descripcion, fecha
- [x] Acciones: aceptar, rechazar, marcar en camino, iniciar, completar
- [x] Boton "Navegar" que abre Google Maps con la direccion del cliente
- [x] Chat integrado con el cliente (link a /bookings/:id desde detalle de trabajo)

**Ganancias (`/provider/earnings`):**

- [x] Resumen de ganancias este mes vs mes anterior
- [x] Total de trabajos completados
- [ ] Historial detallado de pagos (requiere Fase 4)
- [ ] Exportar a CSV

**Perfil del proveedor (`/provider/profile`):**

- [x] Editar: nombre, bio
- [x] Toggle disponibilidad (on/off)
- [x] Ver info completa: telefono, email, zonas, servicios, verificacion, miembro desde
- [x] Stats: rating, trabajos
- [x] Ver tier actual + requisitos para subir
- [ ] Portfolio de trabajos (fotos antes/despues)

**Backend — API para proveedores:**

- [x] `GET /api/provider/dashboard` — KPIs del proveedor autenticado
- [x] `GET /api/provider/jobs` — lista de bookings como proveedor (con filtros)
- [x] `GET /api/provider/earnings` — historial de ganancias
- [x] `PATCH /api/provider/jobs/:id/accept` — aceptar trabajo desde app
- [x] `PATCH /api/provider/jobs/:id/reject` — rechazar trabajo desde app
- [x] `PATCH /api/provider/jobs/:id/status` — cambiar status (en camino, iniciado, completado)
- [x] `PUT /api/provider/profile` — editar perfil
- [x] `GET /api/provider/profile` — ver perfil completo
- [x] Sincronizacion bidireccional: booking.status.changed event → WA notification al proveedor

---

## Fase 2: Trust & Safety

Sistema de confianza de 4 niveles progresivos. Reduce friccion de entrada
(cualquiera entra como Tier 1) mientras construye un asset de datos defendible.
Escala de revision manual a automatizacion sin cambios arquitectonicos.

### 2.1 Sistema de Tiers Progresivos

Modelo inspirado en el reporte de industria: los proveedores desbloquean
acceso a mejores trabajos conforme avanzan en verificacion y desempeno.

```
Tier 1 (Basic)    → Telefono + selfie + 1 foto de ID
                     Trabajos pequenos, aparece en cola, categorias basicas

Tier 2 (Verified) → INE escaneada + comprobante domicilio + categoria declarada
                     Trabajos medianos, visible en busqueda, ratings activos

Tier 3 (Pro)      → Background check + portfolio (fotos de trabajos) + 10 jobs completados
                     Badge Pro, dispatch prioritario, acceso a financiamiento

Tier 4 (Elite)    → Registro de negocio + seguro de responsabilidad + rating 4.7+ sostenido
                     Cuentas corporativas, contratos recurrentes, limites de credito altos
```

- [x] Modelo `ProviderTier` en Prisma (tier, requirements met, unlocked features)
- [x] Logica de promocion automatica de tier al cumplir requisitos
- [x] UI: indicador de tier en perfil del proveedor (badge visible para clientes)
- [x] WhatsApp: notificar al proveedor cuando sube de tier
- [x] Filtrar trabajos disponibles por tier del proveedor
- [x] Actualizar onboarding: todos entran como Tier 1, se les guia a subir

### 2.2 Admin Panel

- [x] Rol ADMIN en schema de Prisma
- [x] Seed de usuario admin
- [x] Endpoints de admin:
  - `GET /api/admin/applications` — solicitudes pendientes
  - `GET /api/admin/applications/:id` — detalle con fotos
  - `PATCH /api/admin/applications/:id/approve` — aprobar (especificar tier)
  - `PATCH /api/admin/applications/:id/reject` — rechazar con motivo
  - `GET /api/admin/stats` — estadisticas generales
  - `GET /api/admin/providers` — gestion de proveedores activos
- [x] Guard de rol ADMIN (`RolesGuard` + `@Roles('ADMIN')` decorator)
- [x] Pagina `/admin`:
  - Dashboard con stats (solicitudes, proveedores por tier, bookings, revenue)
  - Lista de solicitudes con filtros
  - Vista detalle: fotos INE + selfie lado a lado + datos + historial
  - Aprobar/rechazar (rechazar requiere motivo)
- [x] Flujo de aprobacion: crear User + ProviderProfile + asignar tier + notificar por WA
- [x] Reemplazar auto-approve actual por cola de revision

---

> ### 🧪 CHECKPOINT 1 — Admin Panel + Tiers + Trust Score
>
> **Que testear antes de continuar:**
>
> 1. **Onboarding completo via WhatsApp** — verificar que ya NO auto-aprueba, sino que queda en `DOCS_SUBMITTED`
> 2. **Admin panel** (`/admin`) — login como admin, ver stats, revisar solicitudes, aprobar con tier, rechazar con motivo
> 3. **WhatsApp notifications** — al aprobar/rechazar, el proveedor recibe mensaje por WA
> 4. **Tier badge** — buscar proveedores como cliente y verificar que Pro/Elite muestran badge
> 5. **Tier progress** — entrar a `/provider/profile` y ver barra de progreso + requisitos
> 6. **RolesGuard** — verificar que un CUSTOMER no puede acceder a `/api/admin/*` (debe dar 403)
> 7. **Trust score** — completar un booking y verificar que el trust score del proveedor se recalcula
> 8. **Error boundary** — forzar un error en el frontend y verificar que muestra el fallback
>
> **Comando para setup:**
> ```bash
> cd handy/backend
> npx prisma migrate dev --name phase2-trust-safety
> npx prisma db seed
> ```

---

### 2.3 Verificacion Automatizada (Pipeline de 3 Capas)

Procesa 90-95% de verificaciones sin humano. Solo edge cases llegan al admin.

- [x] Integrar MetaMap o Truora:
  - Validacion de INE contra base de datos del INE (instituto)
  - Face match automatico (selfie vs foto de INE)
  - Liveness detection avanzado
- [x] Pipeline de decision:
  - Face match >90% + INE valida → auto-aprobar como Tier 2
  - Face match 70-90% → cola de revision manual
  - Face match <70% o INE invalida → auto-rechazar + notificar
- [x] Webhook para resultado asincrono de MetaMap/Truora
- [x] Audit trail: logging de cada decision con motivo
- [x] Metricas: tasa de auto-aprobacion, tiempo promedio

### 2.4 Safety Features (En-Servicio)

Proteccion durante la ejecucion del servicio. Critico para confianza del consumidor
("stranger in the home" es el riesgo #1 segun investigacion de mercado).

- [x] Fotos obligatorias al inicio y fin del trabajo (documentacion del servicio)
- [x] GPS en tiempo real del proveedor durante el servicio (compartido con cliente)
- [x] Boton SOS en la app conectado a contactos de emergencia del cliente
- [ ] Zero-tolerance: fondo de resolucion rapida para reclamos de robo/dano
- [x] Proveedor muestra badge verificado, foto ID y rating ANTES del booking

### 2.5 Trust Score Dinamico

- [x] Modelo TrustScore en Prisma: score (0-100), factors (JSON), history
- [x] Factores:
  - Rating promedio (30%), tasa completado (25%), reportes (-20% c/u),
  - Cancelaciones (-15% c/u), tiempo respuesta (10%), antiguedad (5%)
- [x] Umbrales:
  - <30 → suspension automatica
  - <50 → warning + reduccion visibilidad
  - >80 → badge "Confiable" + prioridad en busqueda
- [x] Recalcular despues de cada booking, rating o reporte
- [x] Trust score alimenta la promocion/degradacion de tier

---

> ### 🧪 CHECKPOINT 2 — Verificacion Automatizada + Safety
>
> **Que testear antes de continuar:**
>
> 1. **Pipeline de verificacion** — subir fotos INE+selfie y ver que MetaMap/Truora procesa correctamente
> 2. **Auto-approve** — face match >90% debe aprobar automaticamente como Tier 2
> 3. **Cola manual** — face match 70-90% debe llegar al admin para revision manual
> 4. **Auto-reject** — face match <70% debe rechazar y notificar por WA
> 5. **Safety: fotos de servicio** — proveedor debe poder subir foto al inicio y fin del trabajo
> 6. **GPS en tiempo real** — cliente ve ubicacion del proveedor durante el servicio
> 7. **Boton SOS** — funciona y envia alerta a contactos de emergencia

---

### 2.6 Reportes y Disputas

- [x] "Reportar problema" post-servicio (categorias + fotos de evidencia)
- [x] Modelo Report en Prisma
- [x] 3+ reportes en 30 dias → suspension temporal automatica
- [x] Reporte de seguridad → suspension inmediata + revision prioritaria
- [ ] SLA de resolucion de disputas: 24 horas

### 2.7 Re-verificacion Periodica

- [ ] Selfie aleatoria cada 6 meses (face match contra original)
- [ ] Background check anual (Tier 3+)
- [ ] Fallo → suspension temporal hasta resolucion

### 2.8 Compliance — LFPDPPP

- [x] Aviso de privacidad (`/privacy`) con consentimiento explicito
- [x] Derechos ARCO (acceso, rectificacion, cancelacion, oposicion)
- [ ] Retencion de datos: INE eliminada 90 dias post-aprobacion, rechazos a 30 dias
- [ ] Encriptacion de PII en BD (telefono, URLs de fotos)

---

> ### 🧪 CHECKPOINT 3 — Reportes + Compliance
>
> **Que testear antes de continuar:**
>
> 1. **Reportar problema** — cliente puede reportar post-servicio con categorias y fotos
> 2. **Suspension automatica** — proveedor con 3+ reportes en 30 dias queda suspendido
> 3. **Aviso de privacidad** — `/privacy` accesible y con consentimiento
> 4. **Derechos ARCO** — usuario puede solicitar acceso/rectificacion/eliminacion de sus datos
> 5. **Trust score e2e** — verificar que reportes y cancelaciones bajan el trust score correctamente

---

## Fase 3: Infrastructure para Escala (100%) ✅

Cimientos tecnicos. Todo lo que se construya despues depende de esto.

### 3.1 Cola de Trabajos (BullMQ)

- [x] Queues: webhook-processing, notifications, verification, trust-score, payments
- [x] Dashboard de monitoreo (Bull Board en /admin/queues)
- [x] Dead-letter queue config + metricas (admin endpoint /api/admin/queues/stats)
- [x] Graceful fallback: queues deshabilitadas sin Redis (dev local)
- [x] Processors: NotificationProcessor, TrustScoreProcessor, WebhookProcessor

### 3.2 Idempotencia en Webhooks

- [x] Deduplicar webhooks de WhatsApp por message.id (Redis, TTL 24h)
- [x] Idempotency key interceptor para endpoints criticos (header idempotency-key)

### 3.3 Logging Estructurado

- [x] Pino (JSON logs en prod, pretty en dev) + correlation IDs por request
- [x] Auto-logging de requests HTTP con pino-http
- [x] Redaccion de headers sensibles (Authorization, cookies)
- [x] Correlation ID middleware (x-correlation-id) en todas las respuestas
- [ ] Integracion con Grafana Cloud o Axiom (tier gratis)

### 3.4 Manejo Global de Errores

- [x] Exception filter NestJS con formato consistente + correlation ID
- [x] Error boundaries en React (root + route-level)
- [x] API client: retries con exponential backoff + timeouts (30s default)
- [x] Retries automaticos en errores 408, 429, 500, 502, 503, 504

### 3.5 Validacion de Config

- [x] Schema para env vars — servidor no arranca si falta algo critico (produccion)
- [x] Eliminar fallbacks inseguros (JWT_SECRET, JWT_REFRESH_SECRET validados contra lista de defaults inseguros)
- [x] PII_ENCRYPTION_KEY requerida en produccion

### 3.6 Proteccion de PII

- [x] Encriptacion AES-256-GCM para telefono, email, URLs de fotos (EncryptionService)
- [x] Funciones utilitarias: encryptPiiFields, decryptPiiFields, decryptPiiArray
- [x] Sanitizar PII en logs (maskPhone, maskEmail)
- [x] Redaccion automatica de Authorization headers en logs Pino

### 3.7 Versionado de API

- [x] `/api/v1/*` alias transparente a `/api/*`
- [x] Swagger documentado con version

### 3.8 Base de Datos

- [x] Indexes faltantes: ProviderApplication (phone, status), Booking composites, Message.createdAt
- [x] Connection pooling Prisma + Neon (pgbouncer auto-config en produccion)
- [x] Slow query logging en desarrollo (>500ms)
- [ ] Estrategia de particionamiento para tablas grandes

---

> ### 🧪 CHECKPOINT 4 — Infrastructure
>
> **Que testear antes de continuar:**
>
> 1. **BullMQ queues** — enviar un booking y verificar que pasa por la queue (no sincrono)
> 2. **Idempotencia** — enviar el mismo webhook de WA 3 veces, solo se procesa 1
> 3. **Logging** — verificar que los logs JSON llegan a Grafana/Axiom con correlation IDs
> 4. **Regresion completa** — hacer un booking end-to-end y verificar que todo sigue funcionando
>    (onboarding WA, busqueda, booking, chat, rating, dashboard proveedor)
> 5. **PII** — verificar que telefonos y URLs de fotos estan encriptados en la BD

---

## Fase 4: Monetizacion

### 4.1 Estrategia de Precios

Empezar con categorias de precio fijo antes de trabajos de alcance variable.
Reduce disputas y simplifica la UX.

- [ ] Catalogo de precios fijos por categoria:
  - Limpieza de hogar (por tamano): $400-800 MXN
  - Armado de muebles: $200-500 MXN
  - Cambio de filtro HVAC: $300-600 MXN
  - Reparacion de fuga basica: $350-700 MXN
- [ ] Varianza permitida: +/-15% del precio base (requiere aprobacion del cliente si excede)
- [ ] Precios de referencia visibles para el cliente ("Plomeria: $300-$1,500 tipicamente")
- [ ] Fase posterior: cotizacion abierta para trabajos de alcance variable

### 4.2 Integracion de Pagos

- [ ] Pasarela: Stripe Connect (marketplace) o MercadoPago (split payments)
  - Considerar Conekta, OXXO Pay, Clip para cobertura de metodos locales
  - Soporte para pago con tarjeta, transferencia SPEI, y OXXO (efectivo)
- [ ] Flujo del cliente: hold al confirmar → capturar al completar → refund al cancelar
- [ ] Flujo del proveedor:
  - Onboarding de pagos (datos bancarios via pagina segura)
  - Dashboard de ganancias (link desde WhatsApp)
  - Payout automatico semanal
- [ ] Take rate: 15-18% (comparable a Uber Eats MX, menor que TaskRabbit US 15-33%)
- [ ] Facturacion: CFDI/recibos digitales (requerimiento fiscal SAT)
- [ ] Procesamiento via queue `payments` (nunca sincrono)

### 4.3 Cotizacion para Trabajos Variables

- [ ] Proveedor envia cotizacion por WhatsApp → cliente ve en app
- [ ] Negociacion simple (max 2 rondas)
- [ ] Scoping por fotos: cliente envia foto del problema, proveedor cotiza

---

> ### 🧪 CHECKPOINT 5 — Pagos (CRITICO)
>
> **Hay dinero de por medio. Testear exhaustivamente antes de continuar.**
>
> 1. **Pago con tarjeta** — cliente paga, hold se captura al completar, refund al cancelar
> 2. **SPEI y OXXO** — metodos locales funcionan correctamente
> 3. **Take rate** — verificar que el 15-18% se descuenta correctamente
> 4. **Payout** — proveedor recibe su pago en su cuenta bancaria
> 5. **Facturacion** — CFDI se genera correctamente (SAT)
> 6. **Edge cases** — double-payment, timeout, pago parcial, disputas
> 7. **Cotizaciones** — proveedor envia cotizacion por WA, cliente la ve y acepta en app

---

## Fase 5: Engagement (100%) ✅

### 5.1 Push Notifications (FCM)

Reduce dependencia de WhatsApp. A 10K bookings/mes, WA cuesta ~$315/mes. Push es gratis.

- [x] Firebase Cloud Messaging + service worker PWA
- [x] Notificaciones transaccionales (booking aceptado, mensaje, pago)
- [x] Estrategia hibrida: push para urgente, WA solo para onboarding y proveedores sin app
- [x] Config por usuario: silenciar por tipo

### 5.2 Perfil de Usuario Completo

- [x] Perfil: foto, nombre, direcciones guardadas, historial
- [x] Editar perfil + rating del cliente visible para proveedores
- [x] Direcciones frecuentes ("Mi casa", "Oficina")
- [x] Configuracion: notificaciones, eliminar cuenta (ARCO)

### 5.3 PWA para Proveedores (Backup de WhatsApp)

El reporte de industria marca la dependencia de Meta/WhatsApp como riesgo ALTO.
PWA backup que replica la UX de WhatsApp para proveedores.

- [x] PWA proveedor: ver trabajos disponibles, aceptar/rechazar, status, ganancias
- [x] Almacenar relaciones en nuestra BD (no depender de WhatsApp)
- [x] Si WhatsApp falla o sube precios: migrar proveedores a PWA gradualmente
- [ ] Monitorear precios de Meta API trimestralmente

---

> ### 🧪 CHECKPOINT 6 — Push + Perfil + PWA Proveedor
>
> **Que testear antes de continuar:**
>
> 1. **Push notifications** — instalar PWA, recibir push al aceptar booking, mensaje, pago
> 2. **Hibrido WA+Push** — verificar que proveedores SIN app reciben WA y CON app reciben push
> 3. **Perfil completo** — editar foto, nombre, direcciones, ver historial
> 4. **PWA proveedor** — si WA se desactiva, el proveedor puede operar 100% desde la PWA

---

## Fase 6: Growth

### 6.1 Canal B2B — Adquisicion de Demanda

Las administradoras de edificios y property managers son el canal
de adquisicion mas eficiente. Un contrato = cientos de clientes.

- [ ] Partnerships con administradoras de edificios (1 contrato = cientos de deptos)
- [ ] Programa de referidos para porteros/conserjes (credito por cada referido)
- [ ] Cuentas corporativas (empresas que necesitan mantenimiento regular)
- [ ] Contratos recurrentes B2B (limpieza semanal, mantenimiento HVAC trimestral)

### 6.2 Canal de Supply — Adquisicion de Proveedores

El supply side ES el negocio. Fallar aqui = fallar todo.

- [ ] Partnerships con ferreterias (Truper, Home Depot MX, Sodimac)
  - Los proveedores compran ahi diariamente — punto de contacto natural
- [ ] Infiltrar grupos de WhatsApp de oficios (plomeros, electricistas)
- [ ] Programa refer-a-provider: credito por cada referido que complete 10 jobs
- [ ] Field ops en mercados, distribuidoras de materiales, escuelas tecnicas
- [ ] Income guarantee: garantia de ingreso minimo los primeros 10 trabajos

### 6.3 Sistema de Referidos (Clientes)

- [ ] Codigo unico + deep links
- [ ] Credito para quien refiere, descuento para referido
- [ ] Content marketing: antes/despues en Instagram/TikTok con el proveedor real

### 6.4 Programa de Lealtad para Proveedores

- [ ] Niveles alineados con tiers: Tier 1-4 = beneficios crecientes
- [ ] Badges visibles: Respuesta Rapida, Top Rated, Verificado, Veterano

### 6.5 Analytics

- [ ] Event tracking (PostHog): funnels, conversion, churn
- [ ] Provider analytics: trabajos, ingreso, rating, tasa aceptacion
- [ ] Business analytics: GMV, revenue, MRR, LTV, CAC, NPS
- [ ] Unit economics tracking: $120 avg ticket target, 18% take rate, LTV/CAC >3x

---

> ### 🧪 CHECKPOINT 7 — Growth Mechanics
>
> **Que testear antes de continuar:**
>
> 1. **Referidos** — generar codigo, compartir, referido registra, ambos reciben credito
> 2. **Analytics** — verificar funnels en PostHog: registro → booking → completado → repeat
> 3. **Unit economics** — revisar metricas reales vs targets ($120 avg ticket, LTV/CAC >3x)

---

## Fase 7: Advanced Features

- [ ] **Booking programado y recurrente** + calendario de disponibilidad
- [ ] **Multi-idioma** (ES/EN con i18n)
- [ ] **Fotos y media en chat** (antes/despues del trabajo)
- [ ] **Proveedores con equipo** (cuenta empresa)
- [ ] **Busqueda inteligente** ("se me tapo el lavabo" → Plomeria)
- [ ] **Geolocalizacion avanzada**: mapa con pins, autocompletar, Google Maps link
- [ ] **Admin expandido**: pagos, moderacion, categorias, CSV export
- [ ] **Seguro para proveedores**: partnership con aseguradora para cobertura de responsabilidad
- [ ] **Certificaciones**: validar licencias de oficios regulados (gas, electricidad)

---

> ### 🧪 CHECKPOINT 8 — Advanced Features
>
> **Que testear antes de continuar:**
>
> 1. **Booking programado** — agendar para una fecha futura, recordatorios funcionan
> 2. **Fotos en chat** — enviar/recibir fotos antes/despues del trabajo
> 3. **Busqueda inteligente** — escribir "se me tapo el lavabo" y que sugiera Plomeria

---

## Fase 8: Servicios Financieros (El Moat)

NO lanzar antes de 18 meses de datos de transacciones. El flywheel financiero
es lo que transforma a Handy de marketplace a infraestructura financiera.
Modelos comparables: Mercado Credito, Konfio ($1B+), Clip, Nubank (90M+ clientes).

### 8.1 Data Asset — Historial Crediticio Alternativo

- [ ] Acumular datos por proveedor: ingreso mensual, frecuencia de jobs,
  ratings, disputas, cancelaciones, antiguedad, categoria
- [ ] Score crediticio interno basado en datos de la plataforma
  (mas preciso que FICO para economia informal)
- [ ] Estos datos son inaccesibles para bancos tradicionales — ES el moat

### 8.2 Working Capital para Proveedores

- [ ] Micro-prestamos para herramientas y capital de trabajo ($200-$500 USD inicial)
- [ ] Requisito: Tier 3+ (background check + 10 jobs completados)
- [ ] Repago via deduccion automatica de comisiones (no transferencia bancaria)
  - Garantiza collection rate altisimo
- [ ] Aumentar limites basado en historial de repago
- [ ] Partnership con SOFOM regulada o fintech (Konfio, Klar) para no cargar prestamos en balance

### 8.3 Provider Flywheel

```
Proveedor se une (Tier 1)
  → Completa trabajos, acumula historial
  → Sube a Tier 3 (Pro)
  → Recibe prestamo para herramientas ($300 USD)
  → Capacidad aumenta: mas trabajos/semana
  → Mas datos generados, mejor score crediticio
  → Mejores terminos de prestamo
  → Proveedor depende de la plataforma para credito = RETENCION
```

### 8.4 Productos Financieros Futuros

- [ ] Adelanto de ingresos (cobrar el viernes por trabajos del lunes-jueves)
- [ ] Seguro de herramientas y vehiculo
- [ ] Cuenta digital para proveedores (ahorro + pagos)
- [ ] BNPL para clientes en servicios de alto ticket

### 8.5 Regulatorio

- [ ] Estructura legal: partnership con SOFOM o fintech regulada
  (evita necesidad de licencia CNBV propia)
- [ ] Limites de interes y disclosure conforme a Ley Fintech Mexico
- [ ] Credit scoring transparente para proveedores

---

> ### 🧪 CHECKPOINT 9 — Fintech (CRITICO)
>
> **Dinero prestado. Maxima precaucion. Testear con grupo piloto antes de escalar.**
>
> 1. **Score crediticio** — verificar que el score refleja datos reales de la plataforma
> 2. **Micro-prestamo e2e** — solicitar, aprobar, desembolsar, deducir de comisiones
> 3. **Default handling** — que pasa si el proveedor no paga? se suspende correctamente?
> 4. **Regulatorio** — confirmar con abogado que la estructura SOFOM/fintech cumple Ley Fintech
> 5. **Metricas** — default rate <5% con grupo piloto de 100 proveedores Tier 3+

---

## Fase 9: Expansion Regional

Solo despues de dominar Mexico. No expandir antes de 1,000 completados
en cada ciudad y unit economics positivos.

### 9.1 Expansion Nacional

- [ ] Monterrey y Guadalajara (Tier 1 cities despues de CDMX)
- [ ] Puebla, Tijuana, Merida (Tier 2 cities)
- [ ] Adaptar categorias por demanda regional

### 9.2 Expansion LATAM

- [ ] Colombia (Bogota) — alta urbanizacion, app usage fuerte
- [ ] Peru (Lima) — mercado creciente, poca competencia
- [ ] Adaptar: regulacion local, metodos de pago, categorias de servicio
- [ ] Compliance con leyes de datos locales (LGPD en Brasil si se entra)

---

> ### 🧪 CHECKPOINT 10 — Expansion
>
> **Que testear antes de continuar:**
>
> 1. **Ciudad #2** — MTY o GDL funcionan end-to-end (proveedores, bookings, pagos)
> 2. **1,000 jobs** — verificar que se completaron 1,000 jobs en la ciudad antes de expandir
> 3. **Categorias regionales** — categorias adaptadas a la demanda local
> 4. **Latencia** — performance aceptable desde la nueva ciudad

---

## Fase 10: App Nativa — React Native

Solo despues de PMF comprobado con la PWA. La PWA soporta los primeros
10,000+ usuarios sin problema.

- [ ] Expo Router + TypeScript
- [ ] Auth (secure store), servicios, chat, perfil
- [ ] Features nativas (camara, GPS, haptics, animaciones)
- [ ] App Store: Apple Developer ($99/ano) + Google Play ($25)
- [ ] TestFlight + Internal Testing para beta

---

## Metricas de Exito por Fase

| Fase | Metrica Clave | Target |
|------|--------------|--------|
| Foundation | Experiencia completa ambos lados | Booking con GPS + WA interactivo + provider app |
| Trust & Safety | Verificaciones automatizadas | 90%+ auto-procesadas |
| Infrastructure | Reliability | 99.9% uptime, 0 webhooks perdidos |
| Monetizacion | Primera transaccion | $1 de revenue |
| Engagement | Reduccion costos WA | 50%+ notificaciones via push |
| Growth | Unit economics | LTV/CAC > 3x, $120 avg ticket |
| Advanced | Retencion | 40%+ clientes repiten en 60 dias |
| Fintech | Primer prestamo | Default rate < 5% |
| Expansion | Ciudad #2 | 1,000 jobs completados en MTY o GDL |
| Native App | App Store live | 100+ descargas primer mes |

---

## GTM Timeline (Referencia del Reporte de Industria)

| Fase | Timeline | Objetivo |
|------|----------|----------|
| Phase 0 | Meses 1-3 | Tech build, equipo ops CDMX, legal, pagos |
| Phase 1 (Pilot) | Meses 4-7 | 2 colonias en CDMX, 200 proveedores, 4 categorias. Controlar calidad manualmente. |
| Phase 2 (City) | Meses 8-14 | Full CDMX metro, +3 categorias, 1,000 proveedores activos, 10,000 jobs |
| Phase 3 (National) | Meses 15-24 | MTY + GDL. Piloto fintech con 100 proveedores Tier 3. Series A. |
| Phase 4 (Regional) | Meses 25-36 | Colombia (Bogota). Fintech formal. B2B corporativo. Seguro. |

Gate critico: **NO expandir geograficamente antes de 1,000 jobs completados en la ciudad actual.**

---

## Orden de Implementacion

```
Fase 1 (Foundation) → GPS booking + WA UI interactiva + modo proveedor en app
  ↓
Fase 2 (Trust & Safety) → 4 tiers + admin panel + verificacion automatizada + compliance
  ↓
Fase 3 (Infrastructure) → queues, logging, encryption, idempotencia
  ↓
Fase 4 (Monetizacion) → pagos sobre infraestructura solida
  ↓
Fase 5 (Engagement) → push notifications + perfil completo + PWA proveedor backup
  ↓
Fase 6 (Growth) → B2B + supply acquisition + referidos + analytics
  ↓
Fase 7 (Advanced) → scheduling, media, ML, seguros, certificaciones
  ↓
Fase 8 (Fintech) → working capital, score crediticio, provider flywheel
  ↓
Fase 9 (Expansion) → MTY, GDL, luego Colombia/Peru
  ↓
Fase 10 (Native App) → React Native despues de PMF comprobado
```

---

## Stack por Fase

| Fase | Tecnologia adicional | Costo estimado |
|------|---------------------|----------------|
| Foundation | Neon, Upstash, Railway, Vercel, Google Places API | $0-10/mes |
| Trust & Safety | MetaMap o Truora | ~$1-2/verificacion |
| Infrastructure | BullMQ, Pino, Bull Board | $0 (misma infra) |
| Monetizacion | Stripe/MercadoPago/Conekta | 2.9% + $0.30/tx |
| Engagement | Firebase Cloud Messaging | $0 |
| Growth | PostHog, field ops | $0 tech + ops budget |
| Fintech | SOFOM partner, scoring | Partnership (rev share) |
| Expansion | Localizacion, legal | Variable por pais |
| Native App | Expo, Apple/Google | $99 + $25 (unico) |

---

## Revenue Projections (del Reporte)

| Escenario | Proveedores Activos | Jobs/Mes | GMV/Mes | Revenue/Mes (18%) |
|-----------|--------------------:|--------:|---------:|------------------:|
| Pilot | 200 | 480 | $57,600 | $10,368 |
| City | 1,000 | 2,400 | $288,000 | $51,840 |
| National | 5,000 | 12,000 | $1,440,000 | $259,200 |
| Scale | 10,000 | 24,000 | $2,880,000 | $518,400 |

Base: $120 USD avg ticket, 2.4 jobs/mes/proveedor. Fintech layer agrega 30-40% revenue adicional a madurez.
