# Dual-Review Gate (santa-loop) — Subagent Protocol

> **Status — two layers, do not conflate them:**
> - **The rule is `[roca]`:** *code that mutates money or ships to a real user must pass
>   two independent reviewers before it is cleared to push.* One reviewer (the author's
>   own pass) anchors on its own intent and misses what it didn't think to check — that is
>   exactly how a wrong amount, a non-idempotent mutation, or a tenant leak reaches prod on
>   a bot that moves real pesos. Two isolated reviewers with no shared context don't share
>   blind spots.
> - **This implementation is `[andamio]`** — June 24, 2026, first version. The rubric,
>   reviewer wiring, and round count are scaffolding standing on the rule. Tighten or remodel
>   them freely; if the gate rubber-stamps or flags only style, fix the rubric (see
>   Anti-Patterns). Adapted from ECC's `commands/santa-loop.md`; the autonomy around it was
>   left behind on purpose — this gate *blocks*, it does not *act*.

## Purpose

Run two independent reviewers — different models, no shared context — against a change
before it is cleared to push. **Both must return NICE.** If either returns NAUGHTY, fix every
flagged issue, commit, and re-run with **fresh** reviewers (no memory of prior rounds), up to
3 rounds. This is the forcing function that a single self-review can't be: the author always
reviews from inside their own intent.

The gate's job is to *gate*. It never pushes on its own (see Step 6) — that stays a founder
decision, per the always-active rule "Never push to remote without explicit user approval."

**Enforcement (the teeth).** This methodology is prose; an agent could skip it. The versioned
`scripts/hooks/pre-push` hook (wired via `core.hooksPath`) makes it real: it **rejects any push
that touches the money path unless a pushed commit carries the trailer `Dual-Review: PASS`**. So
on NICE, stamp the tip commit with that trailer before pushing. See `architecture.md` §Key Design
Decisions. Escape only via `DUAL_REVIEW_OVERRIDE="reason" git push` (logs a trace) or `--no-verify`.

## When the Main Agent SHOULD Invoke This

1. **Before any push that touches the money path** — `Income`/`Expense`/`Payments`,
   payment-link creation/confirmation, balance math, the financial firewall, or a Prisma
   migration on those tables. This is the primary trigger.
2. **Before shipping a change to the WhatsApp handler that a real user will hit** —
   intents, the AI tool surface, message flows.
3. **When the founder asks** — "santa loop", "/santa-loop", "pasa el gate", "doble review".

For a surgical, non-financial fix that `sota-validation.md` already routes straight to main,
this is optional. Don't gate a typo.

## Workflow

### Step 1 — Identify scope

From `$ARGUMENTS`, else fall back to the working diff:

```bash
git diff --name-only HEAD
```

Read every changed file in full to build the review context.

### Step 2 — Build the rubric

Every criterion needs an objective PASS/FAIL condition. Start from the base set and **always
add the Chalán financial rows when any money-path file is in scope**:

| Criterion | Pass Condition |
|---|---|
| Correctness | Logic sound, edge cases handled, no bugs |
| Error handling | Errors handled explicitly; no silent swallowing that hides a failed money op |
| Completeness | All requirements addressed; no missing cases |
| Internal consistency | No contradictions across files/sections |
| No regressions | Existing behavior preserved; tests still green |
| TS type safety | No `any` smuggling untyped money/IDs; Prisma types honored |
| Migration safety | SQL migration matches schema, is reversible-or-additive, indexes present |

**Chalán financial rows (add whenever the money path is touched):**

| Criterion | Pass Condition |
|---|---|
| Amount integrity | Amounts validated (sign, decimals, currency); never coerced silently; `Decimal` not float for stored money |
| Idempotency / no double-spend | A retry or duplicate webhook/message cannot create a second income, link, or charge |
| Tenant scoping | Every query/mutation is scoped to `providerId`; no cross-tenant read or write |
| Rate-limit honored | Money mutations respect the financial rate-limit guard (Cap. 60); no path bypasses it |
| Confirmation gating | Anything that sends to a client or moves money is gated behind explicit confirmation, not auto-fired |
| Attribution honesty | If the change writes attribution/metrics, causal and correlational signals are not merged into one number |

Tighten rows to the specific change. The rubric is the most important input — a loose rubric
makes the gate theater.

### Step 3 — Dual independent review

Launch **both reviewers in parallel** (both Agent calls in a single message). Neither may see
the other's output. Each evaluates every rubric criterion and returns structured JSON:

```json
{
  "verdict": "PASS" | "FAIL",
  "checks": [{"criterion": "...", "result": "PASS|FAIL", "detail": "..."}],
  "critical_issues": ["..."],
  "suggestions": ["..."]
}
```

**Reviewer A — Claude Opus (always runs).** Spawn `Agent({ subagent_type: "general-purpose",
model: "opus", ... })`. Prompt must include: the full rubric, all files under review, and:
> "You are an independent quality reviewer for a money-handling WhatsApp bot. You have NOT
> seen any other review. Your job is to find problems, not to approve. A missed financial bug
> reaches real pesos. Return the structured JSON verdict."

**Reviewer B — model diversity (in priority order):**

1. **External CLI if installed** (true cross-vendor independence). Detect:
   ```bash
   command -v codex >/dev/null 2>&1 && echo codex
   command -v gemini >/dev/null 2>&1 && echo gemini
   ```
   Write the identical rubric+files prompt to a temp file and run read-only:
   ```bash
   codex exec --sandbox read-only -C "$(pwd)" - < "$PROMPT_FILE"   # or:
   gemini -p "$(cat "$PROMPT_FILE")"
   ```
2. **Else Fable 5** — `Agent({ subagent_type: "general-purpose", model: "fable", ... })`.
   Fable is a different model family from Opus, so this gives genuine model diversity inside
   the harness, no external CLI needed. **This is the default Reviewer B here.**
3. **Last resort — second Opus agent** with isolated context. Log a warning: model diversity
   was not achieved, only context isolation. Acceptable only if Fable and the CLIs are
   unavailable.

### Step 4 — Verdict gate

- **Both PASS → NICE** → go to Step 6.
- **Either FAIL → NAUGHTY** → merge + dedupe critical issues from both, go to Step 5.

### Step 5 — Fix cycle (NAUGHTY)

1. Show all critical issues from both reviewers.
2. Fix **only** what was flagged — no drive-by refactors.
3. Commit the round: `fix: address dual-review findings (round N)`. Committing on NAUGHTY
   preserves the fixes even if the loop is interrupted.
4. Re-run Step 3 with **fresh reviewers** (anti-anchoring — they must not know prior rounds).
5. Repeat until both PASS. **Max 3 rounds.** If still NAUGHTY after 3:

   ```
   DUAL-REVIEW ESCALATION (exceeded 3 rounds)
   Remaining critical issues:
   - [...]
   Manual founder review required. NOT cleared to push.
   ```

### Step 6 — Cleared to push (NICE) — but the founder pushes

On NICE, **do not push automatically.** Print the verdict and stop at the gate:

```
✅ CLEARED TO PUSH — both reviewers returned NICE.
Say "push" to ship, or review the verdict first.
```

The gate proves the change is safe; the founder still authorizes the push. This honors the
roca rule. (If the founder pre-authorized the push in this turn, proceed.)

### Step 7 — Report

```
DUAL-REVIEW VERDICT: [NICE / NAUGHTY (escalated)]
Reviewer A (Opus):        [PASS/FAIL]
Reviewer B ([model]):     [PASS/FAIL]
Both flagged:   [...]
A only:         [...]
B only:         [...]
Rounds: [N]/3    Result: [CLEARED — awaiting push / ESCALATED]
```

## What This Does NOT Replace

- `sota-validation.md` decides the *flow* (main-direct vs branch vs parallel service); this
  gate decides whether the change is *safe to ship*. Run sota-validation first.
- `code-review` / the founder's own judgment for non-shipping work.

## Anti-Patterns

- **Don't gate everything.** A surgical typo fix doesn't need two reviewers. Reserve the gate
  for the money path and user-facing flows.
- **Don't let reviewers rubber-stamp.** If both PASS without finding anything on a real change,
  the rubric is too soft — tighten it, don't trust the green.
- **Don't auto-push on NICE.** The gate clears; the founder ships. Breaking this re-opens the
  exact risk the "never push without approval" rule closed.
- **Don't carry context between rounds.** Fresh reviewers each round, or anchoring defeats the
  point.
