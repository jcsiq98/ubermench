/**
 * Post-LLM sanitization for WhatsApp messages.
 *
 * WhatsApp only supports a subset of markdown:
 *   *bold*   _italic_   ~strikethrough~   ```monospace```
 *
 * LLMs (especially gpt-4o-mini) default to standard markdown (**bold**,
 * __italic__, ## headings, [links](url), tables). This function converts
 * or strips unsupported syntax deterministically — after the LLM responds,
 * before the message is sent.
 */

export function sanitizeForWhatsApp(text: string): string {
  if (!text) return text;

  let result = text;

  // **bold** → *bold* (must run before single-* rules)
  // Handles nested: ***text*** → *text* (bold+italic collapse)
  result = result.replace(/\*{2,3}(.+?)\*{2,3}/g, '*$1*');

  // __italic__ → _italic_
  result = result.replace(/__(.+?)__/g, '_$1_');

  // ## Heading / ### Heading → *Heading* (bold line)
  result = result.replace(/^#{1,6}\s+(.+)$/gm, '*$1*');

  // [link text](url) → link text (url)
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');

  // Markdown tables: lines starting with | → strip pipes, collapse whitespace
  result = result.replace(/^\|(.+)\|$/gm, (_match, inner: string) => {
    return inner
      .split('|')
      .map((cell: string) => cell.trim())
      .filter(Boolean)
      .join('  —  ');
  });

  // Table separator rows (|---|---|) → remove entirely
  result = result.replace(/^\|?[\s\-:|]+\|?$/gm, '');

  // Clean up multiple consecutive blank lines left by removed rows
  result = result.replace(/\n{3,}/g, '\n\n');

  return result.trim();
}
