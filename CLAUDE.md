# Ubermench — Claude Code Context

Read `.sanctuary/ONBOARDING.md` first. It maps the entire knowledge base.

## Quick Context

Ubermench is an AI Business Assistant for independent trades workers in Mexico, delivered via WhatsApp. The bot is named **Chalán**. Stack: NestJS + PostgreSQL + Prisma + Redis + BullMQ (backend), Next.js (web). Deployed on Railway.

Three repos:
- `~/ubermench/` — main codebase (this repo)
- `~/ubermench-docs/` — project documentation, history, operations, research
- `~/ubermench-strategy/` — strategic analysis

## Always-Active Rules

- **Verify before affirming** — show evidence (file, line, output). Never affirm from memory.
- **Production-first debugging** — start with production observability, not local repro.
- **Never push to remote** without explicit user approval. Commits are fine when requested.
- **Document significant decisions** in `~/ubermench-docs/proyecto/HISTORIA_DECISIONES.md`.
- **Communication:** The user communicates in Spanish. Technical deliverables in English.
- **Escalate after 2 failed attempts** — stop and ask the user before the third try.

## Session Start Protocol

1. Read `.sanctuary/BITACORA.md` (last 3-5 entries) — what changed since you last looked. Log your own session there if it changes something significant.
2. Read `.sanctuary/project-context.md` and `.sanctuary/architecture.md`
3. For strategic work: re-read "Estado Real" in `~/ubermench-docs/proyecto/PIVOT_MILESTONES.md` + latest chapter of `HISTORIA_DECISIONES.md`. Never assume docs read in a past session are unchanged.
4. If user says "modo colaboración" → read `.sanctuary/collaboration-rules.md`
5. If user says "research mode" → read `.sanctuary/methodologies/research-mode.md`
6. For all triggers → see `.sanctuary/user-keywords.md`

## Key Paths

- Backend modules: `backend/src/modules/`
- LLM tools: `backend/src/modules/ai/ai.tools.ts`
- System prompt: `backend/src/modules/ai/ai.service.ts`
- Prisma schema: `backend/prisma/schema.prisma`
- Frontend: `web/src/`
- Project history: `~/ubermench-docs/proyecto/HISTORIA_DECISIONES.md`
- Roadmap: `~/ubermench-docs/proyecto/PIVOT_MILESTONES.md`
