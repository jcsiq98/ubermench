# Handy — Estado del Proyecto

> Última actualización: 17 marzo 2026

## Pivot: Marketplace → AI Business Assistant

El proyecto migró de un marketplace de servicios a un asistente de negocios
por WhatsApp powered by AI para trabajadores de oficios en México.

## Phases completadas

### Phase 0.1: Capa de LLM — Conversación inteligente
- [x] Módulo `src/modules/ai/` con OpenAI gpt-4o-mini
- [x] Servicio de contexto conversacional (historial por provider en Redis, 20 msgs, TTL 1h)
- [x] System prompt con fecha dinámica, tono mexicano, detección de intents
- [x] 7 intents: registrar_ingreso, ver_resumen, agendar_cita, confirmar_cliente, ver_agenda, ayuda, conversacion_general
- [x] Rate limiting (30 msgs/hora por provider)
- [x] Fallback si el LLM falla o no entiende
- [x] Action router en whatsapp-provider.handler.ts
- [x] Variables de entorno: OPENAI_API_KEY, OPENAI_MODEL

### Phase 0.3: Income Tracking — Registro de ingresos
- [x] Modelo Prisma `Income` (amount, description, paymentMethod, clientName, date)
- [x] `IncomeService` con create, resúmenes semanal/mensual/diario
- [x] AI extrae monto, descripción, método de pago y cliente del mensaje natural
- [x] Confirmación formateada por WhatsApp
- [ ] Resumen semanal automático (BullMQ cron, enviar cada domingo)
- [ ] Resumen mensual automático (primer día del mes)

### Phase 0.4: Agenda — Citas y recordatorios
- [x] Modelo Prisma `Appointment` (clientName, clientPhone, description, address, scheduledAt, status)
- [x] `AppointmentsService` con create, agenda hoy/mañana/semana
- [x] Parsing de fechas relativas (hoy, mañana, días de la semana) + ISO
- [x] Timezone: America/Mexico_City
- [x] AI extrae fecha, hora, cliente, dirección y descripción
- [ ] Recordatorio automático 1 hora antes (BullMQ scheduled)
- [ ] Recordatorio al cliente si tiene teléfono
- [ ] Marcar cita como completada → preguntar cuánto cobró → crear Income

## Phases pendientes

### Phase 0.2: Speech-to-text — Notas de voz
- [ ] Recibir audio de WhatsApp webhook
- [ ] Descargar archivo de WhatsApp CDN
- [ ] Whisper API para transcripción
- [ ] Pasar transcripción al flujo conversacional

### Phase 0.5: CRM Básico — Clientes del provider
- [ ] Modelo `ProviderClient`
- [ ] Auto-crear cliente cuando se registra ingreso con nombre
- [ ] "¿Quiénes son mis mejores clientes?" → top 5

### Phase 0.6: Dashboard Web (Next.js)
- [ ] Login del provider (phone + OTP)
- [ ] Vista de ingresos con gráfica
- [ ] Vista de agenda/calendario
- [ ] Vista de clientes

### Phase 0.7: Onboarding nuevo provider
- [ ] Simplificar: solo nombre, teléfono, tipo de servicio, zona
- [ ] Tutorial interactivo por WhatsApp

## Bugs conocidos
- Las citas creadas antes del fix de fechas (sessions anteriores) tienen fechas incorrectas en BD
- Sin Redis externo, el historial conversacional se pierde al reiniciar el backend

## Stack
- **Backend**: NestJS + Prisma + PostgreSQL + Redis (in-memory fallback)
- **Frontend**: Next.js (pendiente reconversión a provider dashboard)
- **AI**: OpenAI gpt-4o-mini
- **WhatsApp**: Cloud API v21.0
- **Deploy**: Railway (backend) + Vercel (frontend)

## Variables de entorno requeridas (nuevas)
```
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini  (opcional, default: gpt-4o-mini)
```
