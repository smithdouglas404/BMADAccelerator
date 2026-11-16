// The assistant's name, in one place. Doug renamed the Muse to Socra (Nov 16): Meta has a product called
// Muse. To rename again, run `node scripts/rename-assistant.mjs <NewName>`: it changes this value and the
// name in the Studio's text, prompts, skills and docs in one go.
export const ASSISTANT_NAME = "Socra";

// Records written before a rename (messages, decisions, the team's sample text) still say the old name.
const OLD_NAMES = ["Muse"];
// "Meta Muse" is Meta's assistant (a connector client), not ours, so it keeps its name.
const OLD_ALT = OLD_NAMES.filter((n) => n !== ASSISTANT_NAME).join("|") || "(?!)";
const OLD = new RegExp(`(?<!Meta )\\b(${OLD_ALT})\\b`, "g");

/** Shows any older name of the assistant as its current name. */
export function brand(text: string): string {
  if (!text) return text;
  const article = new RegExp(`\\b[Tt]he (${OLD_ALT})\\b`, "g");
  return text.replace(article, ASSISTANT_NAME).replace(OLD, ASSISTANT_NAME);
}

/** The line under the brand. Doug (Nov 16): the product is branded with the assistant's name, "Socra", with
 *  "Working Backwards Studio" underneath. */
export const PRODUCT_LINE = "Working Backwards Studio";

/** The product's full name: the browser tab, emails, and what outside assistants see (MCP, REST, OAuth). */
export const PRODUCT_NAME = `${ASSISTANT_NAME} · ${PRODUCT_LINE}`;
