/**
 * Serving count from the free-text "How much?" field, or undefined when the
 * text isn't a count. "2", "2 capsules" and "1.5 scoops" are servings;
 * "500 mg" is an amount per serving, not 500 servings, so it stays a note.
 */
const SERVING_WORDS = /^(x|×|servings?|capsules?|caps?|tablets?|tabs?|softgels?|gummies|gummy|scoops?|sachets?|pumps?|sprays?|drops?|pills?)?$/i;

export function parseServings(text?: string): number | undefined {
  const match = text?.trim().match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!match || !SERVING_WORDS.test(match[2].trim())) return undefined;
  const n = parseFloat(match[1].replace(',', '.'));
  return n > 0 && n <= 50 ? n : undefined;
}
