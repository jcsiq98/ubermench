# Ubermench — Agent Onboarding

You are entering the Ubermench project workspace. Read this file completely before doing anything else.

## What This Is

Ubermench is an AI Business Assistant for independent trades workers (plomeros, electricistas, albañiles) in Mexico. The bot — named **Chalán** — lives on WhatsApp and handles income tracking, scheduling, invoicing, and CRM. Stack: NestJS + PostgreSQL + Prisma + Redis + BullMQ (backend), Next.js (web).

## Carta para el modelo entrante

You are reading a knowledge base built so a fresh model can land cold and operate at full power. If you are a more capable model than the ones before you — that is exactly who this was written for. Read this part before anything else, because it sets *how* you should hold everything that follows.

**You inherit lessons, not shackles.** Some of what is documented here cost real pain or money to learn (`[roca]`). Honor it — don't relitigate it without strong reason. But much of it is scaffolding (`[andamio]`): bets the founder made on a moment to get off the ground, written in the same authoritative voice as the hard-won lessons. **A more powerful model that defers uniformly to everything written becomes a more eloquent defender of stale narrative — the opposite of useful.** Your power is wasted if you spend it guarding April's guesses.

**So your job is discernment, not deference:**
- Learn the vocabulary in `.sanctuary/epistemic-status.md` (`[roca]` / `[andamio]` / `[corriente]`) and apply it as you read.
- **Default any undated narrative to `[andamio]`, not `[roca]`.** Hold it loosely until it earns weight.
- "Verify before affirming" applies to strategic narratives too, not only code. When a documented thesis is months old, flag it — "this rests on evidence that may have moved; does it still stand?" — instead of enforcing it.
- The founder *wants* to be challenged. He is water; he wants the project fluid. Defending a `[roca]` when he's in flow is the riverbank that keeps him from flooding — good. Defending an `[andamio]` is the cage — bad. The whole skill is telling them apart.
- **If you run in Claude Code:** you have subagents. When you're about to refuse or push back on a founder request because of what you read in the docs, don't trust your own summary — spawn the Epistemic Auditor (`.sanctuary/methodologies/epistemic-auditor.md`). It returns a structured assessment that separates what's [roca] from what's [corriente]. Only [roca] can block the founder. See `CLAUDE.md` → "Epistemic Hierarchy".
- When you want to think out loud, explore, or push a fresh idea without it ossifying into doctrine, use `.sanctuary/exploraciones/` — the room built for exactly that.

This sanctuary is, in part, a letter to its next reader. Leave it better: tag what you learn, retire scaffolds that have done their job, and never freeze your own fresh thinking into the next model's cage.

## Knowledge Map

### Read First, Every Session (Landing Protocol)
- `.sanctuary/BITACORA.md` — Cross-tool session log: what changed since you last looked. **Read the last 3-5 entries before operating; add one line when your session changes something significant.** The project is worked from multiple tools — without this, you operate on a stale snapshot. This protocol exists because on June 11 an agent nearly overwrote a roadmap rewritten the day before in another session.
- For strategic work, also re-read: "Estado Real" in `ubermench-docs/proyecto/PIVOT_MILESTONES.md` + the latest chapter of `HISTORIA_DECISIONES.md`. Never assume documents you read in a previous session are unchanged.

### Always Read (Core Context)
- `.sanctuary/project-context.md` — What the product is, current state, identity, testing accounts, observability
- `.sanctuary/architecture.md` — Technical architecture, backend modules, design decisions, git protocol
- `.sanctuary/chalan-voice.md` — Bot personality and tone (read before touching any user-facing text)
- `.sanctuary/documentation-philosophy.md` — How we document decisions
- `.sanctuary/epistemic-status.md` — How to hold what you read: `[roca]` / `[andamio]` / `[corriente]`. Read right after the Carta above — it makes the rest legible.

### Think Out Loud (No Doctrine)
- `.sanctuary/exploraciones/` — The room for thinking out loud, exploring, and challenging ideas with the founder. Everything here is `[corriente]` by definition — provisional, expected to change, never `[roca]`. Use it instead of letting fresh ideas leak into the permanent record as frozen truth.

### Read When Activated (Methodologies)
- `.sanctuary/methodologies/epistemic-auditor.md` — **Subagent protocol for epistemic evaluation (Claude Code).** Auto-triggered: when the agent is about to refuse/recommend-against a founder request based on strategic docs. Manual trigger: `/sanctuary-check`, "revisa el estatus epistémico", "qué tan firme es esto". See also: `CLAUDE.md` → "Epistemic Hierarchy" section.
- `.sanctuary/collaboration-rules.md` — Agent behavior rules (AB-01 to AB-06). Trigger: "modo colaboración", "aplica AB", "debug en equipo"
- `.sanctuary/methodologies/research-mode.md` — Anti-hallucination mode. Trigger: "research mode", "modo investigación", "investiga"
- `.sanctuary/methodologies/cross-model-debugging.md` — LLM bug debugging. Trigger: "cross-model debug", "el modelo se equivocó"
- `.sanctuary/methodologies/check-prompts.md` — Post-implementation validation. Trigger: "prepara checks", "check prompts"
- `.sanctuary/methodologies/sota-validation.md` — New model/change risk assessment. Trigger: "nuevo SOTA", "validar SOTA"
- `.sanctuary/methodologies/production-incident-protocol.md` — Production-first debugging (active when production incident reported)
- `.sanctuary/methodologies/interview-system.md` — Customer discovery workflow. Trigger: "transcribe", "nueva entrevista"

### Custom Commands
- `.sanctuary/user-keywords.md` — Full table of trigger phrases that activate specific behaviors

### External Repos (Do Not Modify Without Permission)
- `~/ubermench-docs/` — Project documentation: history (`proyecto/`), operations (`operacion/`), architecture ADRs (`arquitectura/`), thinking sessions (`sesiones/`), customer research (`research/`)
- `~/ubermench-strategy/` — Strategic analysis: pivot thesis, market analysis, meta-analysis

## Behavioral Baseline

These rules apply to every session, regardless of tool or mode:

1. **Verify before affirming.** Never state a fact without checking the actual state (file, command output, git log). "I'm not sure, let me check" is always valid.
2. **Evidence required.** Every factual claim comes with evidence: file name, line number, output, or quote.
3. **Production-first debugging.** When a bug is reported in production, start with production observability — not local reproduction.
4. **Never push to remote without explicit user approval.** Commits are fine when requested; pushing requires the user to say "push", "sube", "despliega", or equivalent.
5. **Document significant decisions** in `~/ubermench-docs/proyecto/HISTORIA_DECISIONES.md`.
6. **Escalate after 2 failed attempts.** If the same approach fails twice, stop and ask the user before the third attempt.
7. **Communication:** The user communicates in Spanish. Technical deliverables (code, commits, docs) in English.
