// Runs once when the server starts: copies the keys and models saved on the Settings page into process.env.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { loadSettingsIntoEnv } = await import("@/lib/settings");
  await loadSettingsIntoEnv();
  // Previews die with the server (a restart or an image rebuild). Bring back every product that has a
  // built app, a few at a time, in the background.
  const { resumePreviews } = await import("@/lib/preview");
  setTimeout(() => void resumePreviews().catch((e) => console.error("resume previews", e)), 3000);
}
