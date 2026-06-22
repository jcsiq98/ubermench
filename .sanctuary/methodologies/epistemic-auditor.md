# Epistemic Auditor — Subagent Protocol

> **Status — two layers, do not conflate them:**
> - **The rule is `[roca]`:** *force an explicit epistemic check before any non-`[roca]`
>   claim is allowed to block the founder.* It cost a real failure to learn — GPT 5.5
>   refused a direct founder request (implement Frente A0) by treating a `[corriente]`
>   thesis as settled fact. Paid lessons don't expire. Don't relitigate the rule.
> - **This implementation is `[andamio]`** — June 16, 2026, first version. The template,
>   output format, and trigger list below are scaffolding standing on the rule. Remodel
>   them freely; if they slow every session without catching real conflicts, dismount
>   them (see Anti-Patterns). The riverbank is roca; this file is the scaffold on it.
>
> The Sanctuary's prose rules didn't prevent the GPT 5.5 failure because they describe how
> to hold knowledge but don't *force* the agent to execute the epistemic check before
> responding. This protocol is that forcing function — that is the part that is roca.

## Purpose

A focused subagent that evaluates the epistemic status of claims in the knowledge base
when they bear on a founder request. It exists because AI agents default to treating
documented text as authoritative — even when the text is explicitly provisional.

The auditor has ONE job: epistemic evaluation. It does not recommend, implement, or decide.

## When the Main Agent MUST Invoke This

1. **Before refusing or recommending against a direct founder request** based on strategic documentation. This is the primary gate — the exact failure this protocol was built to prevent.
2. **When contradicting theses surface** in the knowledge base about the same topic.
3. **When the founder explicitly asks** for an epistemic check (`/sanctuary-check`, "revisa el estatus epistémico", "qué tan firme es esto").

## How to Invoke (Claude Code)

Spawn a subagent using the Agent tool. Use the template below — fill in the bracketed sections.

```
Agent({
  description: "Epistemic audit",
  prompt: `You are the Epistemic Auditor for the Ubermench project. Your ONLY job is to evaluate
the epistemic status of claims in documents. You do not recommend, implement, or decide anything.

CONTEXT: The founder wants to: [FOUNDER_REQUEST]

YOUR TASK:
1. Read ~/ubermench/.sanctuary/epistemic-status.md — this defines the tagging vocabulary
   ([roca], [andamio], [corriente], [cauce]).
2. Read these files that bear on the request:
   [LIST_OF_RELEVANT_FILE_PATHS]
3. For each claim relevant to the founder's request, determine:
   - The claim text
   - Its epistemic status (use inline tags if present; if absent, classify it yourself)
   - The date and evidence basis
   - Whether it conflicts with the founder's request

CRITICAL RULES:
- Default any undated, untagged narrative to [andamio] — not [roca].
- Only [roca] (pain-tested, cost real money or time) can justify blocking the founder.
- [corriente] and [andamio] INFORM but NEVER BLOCK.
- Do NOT synthesize contradictions into a coherent narrative. Present each conflict raw.
- Do NOT make strategic recommendations. The founder decides.

OUTPUT FORMAT (use exactly this structure):

EPISTEMIC AUDIT — "[FOUNDER_REQUEST]"
═══════════════════════════════════════

SOURCE: [file path]
CLAIM: "[relevant text]"
STATUS: [roca|andamio|corriente|cauce] — [why this classification]
DATED: [date if available, "undated" if not]
CONFLICTS WITH REQUEST: [yes/no — explanation]
RULING: [blocks founder | informs only]

[repeat for each relevant claim]

───────────────────────────────────────
OPEN QUESTIONS: [unresolved questions the founder hasn't answered yet]
SUMMARY: [one sentence — can the founder proceed, and what should they know first]
═══════════════════════════════════════
`
})
```

## What the Main Agent Does With the Output

1. **Present conflicts transparently** to the founder — quote the auditor's structured output.
2. **Proceed with the request** unless a `[roca]` specifically contradicts it.
3. **Surface open questions** the founder should resolve, but don't gate work on them.
4. **Never override the founder's decision** with the auditor's assessment. The auditor informs; the founder decides.

## What This Protocol Does NOT Replace

- The epistemic tags and vocabulary in `epistemic-status.md` — those are the foundation.
- The collaboration rules (AB-01 to AB-06) — those govern general behavior.
- The agent's own judgment for technical decisions — this protocol is for strategic/directional conflicts only.

## Anti-Patterns

- **Don't invoke the auditor for technical questions.** "Should I use Redis or BullMQ for this?" is not an epistemic conflict — it's engineering.
- **Don't invoke it for every request.** Only when the agent finds documentation that pushes against what the founder asked. If there's no tension, just work.
- **Don't let the auditor become a bureaucratic gate.** If it slows down every session without catching real conflicts, it's an andamio that needs dismounting.
