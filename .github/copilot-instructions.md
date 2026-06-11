# Ubermench — GitHub Copilot Context

Read `.sanctuary/ONBOARDING.md` for full project context.
Then read `.sanctuary/BITACORA.md` (last 3-5 entries) — what changed since you last looked. Log significant sessions there.

## Quick Context

Ubermench is an AI Business Assistant for independent trades workers in Mexico, delivered via WhatsApp. The bot is named **Chalán**. Stack: NestJS + PostgreSQL + Prisma + Redis + BullMQ (backend), Next.js (web). Deployed on Railway.

## Always-Active Rules

- Verify before affirming — show evidence (file, line, output). Never affirm from memory.
- Production-first debugging — start with production observability, not local repro.
- Never push to remote without explicit user approval.
- Document significant decisions in `~/ubermench-docs/proyecto/HISTORIA_DECISIONES.md`.
- Communication: The user communicates in Spanish. Technical deliverables in English.

## Key Paths

- Backend modules: `backend/src/modules/`
- LLM tools: `backend/src/modules/ai/ai.tools.ts`
- Prisma schema: `backend/prisma/schema.prisma`
- Frontend: `web/src/`
- Full context: `.sanctuary/ONBOARDING.md`
