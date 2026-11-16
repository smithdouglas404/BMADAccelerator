// The assistant's name, in one place. Doug renamed the Muse to Socra (Nov 16): Meta has a product called
// Muse. To rename again, run `node scripts/rename-assistant.mjs <NewName>`: it changes this value and the
// name in the Studio's text, prompts, skills and docs in one go.
export const ASSISTANT_NAME = "Socra";

// Records written before a rename (messages, decisions, the team's sample text) still say the old name.
const OLD_NAMES = ["Muse"];
const OLD = new RegExp(`\\b(${OLD_NAMES.filter((n) => n !== ASSISTANT_NAME).join("|") || "(?!)"})\\b`, "g");

/** Shows any older name of the assistant as its current name. */
export function brand(text: string): string {
  if (!text) return text;
  const article = new RegExp(`\\b[Tt]he (${OLD.source.slice(3, -3)})\\b`, "g");
  return text.replace(article, ASSISTANT_NAME).replace(OLD, ASSISTANT_NAME);
}
