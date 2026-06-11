# Ubermench — Project Context

> **Estatus epistémico:** la sección **Philosophy** y la **identidad de Chalán** son
> `[roca]` — valores durables, no apuestas. El **estado del producto** y las cuentas de
> prueba son hechos verificables (`[roca]` mientras sigan ciertos: verifica). Cualquier
> afirmación *estratégica o de mercado* sin fecha trátala como `[andamio]` por default.
> Ver `epistemic-status.md`.

AI Business Assistant for independent trades workers (plomeros, electricistas, albañiles) in Mexico. WhatsApp-based business assistant powered by LLM: income tracking, scheduling, invoicing, CRM.

## Foco actual (actualizar en cada reescritura de roadmap)

> **Junio 10, 2026 — Cap. 57:** dos frentes en paralelo. **A:** primer loop de dinero (lectura del ledger → reactivación → cobranza → pesos atribuibles). **B:** distribución fuera del círculo del founder (diagnóstico del freno → pitch de dinero → 3-5 usuarios externos). Pregunta organizadora: *¿puede Chalán ponerle pesos en la mano a un trabajador que el founder no conoce?* Detalle: `ubermench-docs/proyecto/PIVOT_MILESTONES.md`.

## Philosophy

This project exists to empower, not to extract. The trades workers we serve — plomeros, electricistas, albañiles — are people who build the world with their hands. They don't need another platform taking a cut. They need tools that make them stronger.

Core principles that guide every decision:

- **Flexibility over rigidity.** We pivoted once, we'll pivot again if the data says so. Plans serve us, we don't serve plans. History matters — read `ubermench-docs/proyecto/HISTORIA_DECISIONES.md` before proposing big changes.
- **Fairness in giving and receiving.** We pay people justly. We charge users fairly. The 50/50 partnership behind this project exists because both sides bring real value, and both sides are respected equally. That standard extends to every relationship — with developers, with users, with partners.
- **Build only what's proven.** No feature ships because we imagined someone needs it. It ships because a real plomero asked for it, or the data showed it. Launch small, measure, iterate.
- **Honesty over impressiveness.** A simple solution that works beats an elaborate one that looks good. We'd rather say "we don't know yet" than pretend we do.
- **Know your history.** Every decision, pivot, and lesson is documented. Not for bureaucracy — so we never repeat the mistakes we already paid for.

## Project Knowledge Base

**History is our most valuable asset** — always consult these sources before proposing changes, making strategic claims, or planning features.

### 1. Main Codebase — `/home/jcsiq98/ubermench/` (this workspace)
Source of truth for what exists today.
- `backend/` — NestJS + TypeScript + Prisma + PostgreSQL + Redis + BullMQ
- `web/` — Next.js (App Router) — provider dashboard, being reconverted from marketplace UI
- `scripts/` — Utilities (start-db.js for embedded PostgreSQL)
- `_archive/` — Old marketplace code and research preserved for reference (do NOT modify)

### 2. Documentation — `/home/jcsiq98/ubermench-docs/`
All project documentation, organized by function:
- `proyecto/` — Foundational docs: `HISTORIA_DECISIONES.md`, `PIVOT_ESTRATEGICO.md`, `PIVOT_MILESTONES.md`
- `operacion/` — Execution: `PLAN_PRUEBAS_FOUNDER.md`, `META_WHATSAPP_CHECKLIST.md`, `GUION_PRIMEROS_5_USUARIOS.md`, `PRESUPUESTO.md`
- `research/` — Customer discovery: `GUION_ENTREVISTAS.md`, `WORKANA_POST_RESEARCHER.md`, `tools/`
- `sesiones/` — Deep thinking sessions (e.g. `2026-04-10-sesion-densa.md`)
- `arquitectura/` — ADRs (Architecture Decision Records)
- `_archive/` — Historical docs no longer actionable

### How to use these sources
- **Before proposing big changes:** Read `proyecto/HISTORIA_DECISIONES.md` and `proyecto/PIVOT_ESTRATEGICO.md`.
- **Before planning features:** Check `proyecto/PIVOT_MILESTONES.md` for current roadmap state.
- **Before making market claims:** Consult `/home/jcsiq98/ubermench/_archive/handy-docs/` for LATAM market data (costs, DB access notes, research PDFs).
- **When in doubt about a past decision:** The answer is probably documented. Search docs first.

## Bot Identity: Chalán

The bot's name is **Chalán** — the trade worker's helper. In Mexican trades culture, a chalán is the maestro's assistant: carries materials, mixes cement, passes tools. The bot assumes that role for administrative work (accounts, appointments, billing) so the maestro focuses on his craft.

- **Tone:** Mexican Spanish, direct, serviceable, professional without being formal. Speaks like someone from the trade, not a corporate suit. No forced slang.
- **Power dynamic:** The bot is positioned *below* the user. The maestro commands, the Chalán executes.
- **Calibration:** The bot doesn't impose personality — it calibrates to the user's register over time.
- **Brand vs identity:** "Ubermench" is the product/company. "Chalán" is the bot's identity. Different layers.

See `proyecto/HISTORIA_DECISIONES.md` Chapter 20 for the full rationale.

## Founder Testing Accounts

- **José Carlos (founder):** +526565884840 — personal number used for testing. User "José Carlos", role PROVIDER, trade "trabajador independiente." Timezone: America/Mexico_City (default).
- **Oscar Perez (co-founder):** +526563954480 — active user in Miami. User "Oscar Perez", role PROVIDER, trade "electricista." Timezone: America/New_York. First non-CDMX user — triggered timezone implementation (Cap. 37).

**⚠️ Sobre TODOS los usuarios de producción (a junio 2026, Cap. 58):** son T0 (founders) o T1 (familia/amigos invitados). **Los oficios registrados en la DB son ficticios** — pruebas de onboarding, no segmento real. No leer la lista de `/api/internal/users` como composición de mercado. Taxonomía T0-T3 y regla de peso de evidencia: Cap. 58.

## Internal Observability Endpoints (verify-token protected)

- `GET /api/internal/users` — List all users with message counts
- `GET /api/internal/users/:phone/conversation?limit=50` — Full conversation, profile, appointments for any phone. Handles all Mexican phone format variants
- `PATCH /api/internal/users/by-phone/:phone` — Fix user data (name, etc.)

## Legacy Marketplace ("Handy") — retirado (Cap. 54 Etapa A, Cap. 59 Etapa A2)

El código marketplace **ya no vive en este repo**. Archivado en `/home/jcsiq98/handy-legacy/` (fuera de git): runtime marketplace (Cap. 54, mayo 28), módulos vestigiales + UI web marketplace (Cap. 59, junio 11). El backend activo tiene 13 módulos; `web/` expone solo landing de Chalán + `/payment/*` + `/privacy`.

**Aún presente pero dormido (sale con Etapa B, solo vía staging):**
- Tablas Prisma (`Booking`, `Message`, `Rating`, `Zone`, etc.) — schema intacto
- Campo `tier` en `ProviderProfile`
- Fallbacks de secretos dev con nombre `handy-*` y salt PII `handy-pii-salt` (este último NO renombrable sin re-cifrar datos)

**Pendiente con cara al usuario:** `/privacy` aún cita "Handy Technologies, S.A.P.I. de C.V." y `privacidad@handy.mx` — entidad legal y correo los decide el founder.

Do NOT reactivar marketplace sin decisión explícita documentada en `HISTORIA_DECISIONES.md`.
