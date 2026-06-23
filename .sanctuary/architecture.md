# Ubermench — Architecture

> **Estatus epistémico:** este documento es predominantemente `[roca]` — hechos
> técnicos y lecciones que costaron dolor (sanitización server-side, voz única,
> timezone, dedup atómico). Sostén lo de aquí firme. Las pocas `[corriente]` están
> marcadas en línea (ej. webhook de Stripe Connect pendiente de config). Ver
> `epistemic-status.md`.

## Active Backend Modules (`backend/src/modules/`)

- `ai/` — LLM integration (OpenAI) via **function calling** (typed tools in `ai.tools.ts` — count changes often; the code is the source of truth), conversation context (Redis). Intent classification uses tool selection, NOT prompt-based rules. System prompt is minimal (personality + context only)
- `workspace/` — Provider business profile via chat (services, prices, schedule, auto-reply, notes, **structured learned facts**, **timezone**). Cache-first (Redis → DB). Injected into LLM system prompt for personalized responses. `timezone` field (IANA string, default `America/Mexico_City`) drives all date/time logic — parsing, formatting, system prompt clock, cron jobs, BullMQ processors (Cap. 37). Learned facts are `StructuredFact[]` with `{fact, category, firstSeen, lastSeen}` — categories: personal/negocio/clientes/preferencias/patrones. Max 100 facts. Auto-decay at 60 days. Extracted every ~10 messages via LLM (Cap. 29)
- `income/` — Income tracking, weekly/monthly summaries
- `expense/` — Expense tracking (puntual + recurring). 7 LLM tools: `registrar_gasto`, `borrar_ultimo_gasto`, `borrar_gasto_por_descripcion`, `corregir_ultimo_gasto`, `crear_gasto_recurrente`, `cancelar_gasto_recurrente`, `modificar_gasto_recurrente`, `listar_gastos_recurrentes`. `RecurringExpense` model with cron-based auto-creation. See Cap. 36 for "cobro" vs gasto disambiguation.
- `appointments/` — Scheduling, Spanish date parsing, reminders, **modify/cancel/followup (full CRUD)**. All date/time logic timezone-aware via shared `timezone.utils.ts` (Cap. 37). BullMQ jobs: "¿Se hizo?" 30min post-appointment + configurable pre-appointment reminder (`reminderMinutes`). Cron safety net marks stale PENDING and CONFIRMED appointments as NO_SHOW every 30 min. **BullMQ active in production since Cap. 26**.
- `whatsapp/` — Core: webhook handler (atomic dedup via `setNX` — Cap. 30), message sending, provider handler (hybrid commands + LLM routing). **Rule:** BullMQ processors must `.catch()` non-critical steps after `sendTextMessage` to prevent retries that duplicate messages (Cap. 30)
- Provider registration via WhatsApp lives in `whatsapp/whatsapp-onboarding.handler.ts` (the `onboarding/` web module was retired in Cap. 59). Messages logged to conversation_logs (Cap. 27)
- `reminders/` — Standalone personal reminders separate from work appointments (Cap. 28). CRUD completo via 5 LLM tools (`crear_recordatorio`, `ver_recordatorios`, `modificar_recordatorio`, `cancelar_recordatorio`, `completar_recordatorio`). Prisma model `Reminder` (id, providerId, description, remindAt, status). BullMQ queue `PERSONAL_REMINDER` sends WhatsApp notification at remind time. Cron safety net marks stale PENDING as SENT every 30 min. System prompt rule 16 disambiguates: no client = recordatorio, not cita.
- `contacts/` — Provider CRM (Sprint 1 — Universo de negocio). Global module. `Contact` model (name, phone E.164, notes, source). Tools: `guardar_contacto`, `buscar_contactos`. `crear_link_cobro` uses `sendToClient` + delegated send with explicit confirmation (no auto-send to third parties). Sync on income/appointment when phone present.
- `payments/` — Stripe Connect Express integration (Cap. 32, live validated Cap. 50). Global module. 2 LLM tools (`crear_link_cobro`, `activar_cobros`). Provider onboarding creates Express account → hosted form → webhook `account.updated` activates (requires Connect-scoped webhook). Payment links create Checkout Sessions on connected account (`CHECKOUT_EXPIRY_HOURS=23`, Stripe max <24h). Min $10 MXN. `refreshProviderStripeStatus()` when DB stale. Webhook `checkout.session.completed` should auto-create Income with `paymentMethod: PAYMENT_LINK` — **pending Connect webhook config** (Cap. 50). Checkout currently card-only; OXXO/SPEI promised in copy but not enabled on connected account yet.
- `provider-model/` — Structured provider model (`ProviderModelService`). Builds a living representation of the provider from workspace data, appointments, income patterns, and learned facts. Used for contextual touchpoints (Cap. 34).
- `users/`, `auth/`, `admin/` — support modules. (`providers/`, `notifications/`, `verification/`, `zones/`, `addresses/`, `provider-dashboard/`, `onboarding/` web flow: retired to `handy-legacy/` in Cap. 59 — Etapa A2)

## Key Design Decisions

- Providers interact primarily via WhatsApp (93% penetration in Mexico). The LLM handles natural language + voice notes.
- The product does NOT intermediate transactions — it empowers providers to run their own business.
- Cash payments are tracked, not replaced. Digital payments are optional via payment links.
- **Intent classification uses OpenAI function calling (tools), not prompt-based rules.** Each action is a typed tool definition in `ai.tools.ts`. The system prompt contains only personality and workspace context — no classification rules. Adding a new action = adding a tool, not editing the prompt. See `proyecto/HISTORIA_DECISIONES.md` Chapter 16 for the full rationale.
- **Always sanitize LLM-extracted optional fields server-side** before using them in DB queries. The LLM will fill optional fields with nonsense from colloquial speech (e.g. `clientName: "ninguna"` from "No, ninguna"). See Cap. 30.
- **All date/time logic uses the provider's timezone**, stored in `WorkspaceProfile.timezone` (IANA string, default `America/Mexico_City`). Shared utility: `backend/src/common/utils/timezone.utils.ts`. Never hardcode `America/Mexico_City` or UTC offsets — always use the utility functions. Cron jobs run hourly and filter by provider's local hour. See Cap. 37.
- **Memory is context, the ledger is truth.** Truth hierarchy: ledger (Postgres) > learned memory > conversation history. Operational claims (money, agenda, client state) must resolve via a tool that reads the ledger; memory never holds amounts/dates/balances as authority. Full rule (4 reglas + where each lives in code): `.sanctuary/memory-policy.md` `[roca]`.
- **A versioned pre-commit secret guard blocks live keys and sensitive files.** `scripts/hooks/pre-commit`, wired via `core.hooksPath` (run `git config core.hooksPath scripts/hooks` once per clone). Blocks sensitive filenames (`.env*`, `*.pem/.key/.p12`, `id_rsa`) and high-signal key patterns in added lines. Escapes: per-line `secret-guard:allow` marker, or `git commit --no-verify`. A money agent's repo must never leak a key — the one mechanism we borrowed from ECC's harness (the sanctuary already wins on epistemics, so its memory/skills layer was not adopted).

## Git Protocol

- **Never push to remote without explicit user approval.** Commits are fine when requested; pushing requires the user to say "push", "sube", "despliega", or equivalent.
- **Always commit with descriptive messages** following the project convention: `type: concise description with intent` (e.g. `fix: onboarding crash when Cloudinary is not configured in dev`).
- **Never force push to main/master.** Warn if the user requests it.
- **After committing, show git status** so the user can decide whether to push.
