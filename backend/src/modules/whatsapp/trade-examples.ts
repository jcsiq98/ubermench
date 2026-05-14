/**
 * Message formatting helpers for the post-onboarding welcome.
 *
 * The actual 3 examples are generated dynamically by WelcomeExamplesService
 * (LLM call anchored to real bot capabilities). These helpers only handle
 * how the strings get assembled into a WhatsApp-ready message.
 *
 * Two flows:
 * - No pending request: single message with greeting + examples block.
 * - With pending request: short greeting first, the user's request gets
 *   processed (producing its own confirmation), then examples block as a
 *   second message.
 */

export function buildShortGreeting(name: string): string {
  const safeName = (name || '').trim();
  return safeName
    ? `Listo, ${safeName}. Ya tienes tu Chalán.`
    : 'Listo. Ya tienes tu Chalán.';
}

/**
 * Render the examples block. If `examples` is null or empty (LLM
 * generation failed/timed out), fall back to a generic short closer
 * without bullets.
 */
export function buildExamplesBlock(examples: readonly string[] | null): string {
  if (!examples || examples.length === 0) {
    return 'Dime qué necesitas — por texto o por audio.';
  }

  const bullets = examples.map((e) => `• "${e}"`).join('\n');
  return (
    `Te puedo ayudar con cosas así:\n${bullets}\n\n` +
    `Por texto o por audio, como te acomode.`
  );
}

/**
 * Convenience: full single-message welcome (used when there is no
 * pending operational request to process first).
 */
export function buildWelcomeMessage(
  name: string,
  examples: readonly string[] | null,
): string {
  return `${buildShortGreeting(name)}\n\n${buildExamplesBlock(examples)}`;
}
