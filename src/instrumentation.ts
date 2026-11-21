// Runs once when the server starts: copies the keys and models saved on the Settings page into process.env.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { loadSettingsIntoEnv } = await import("@/lib/settings");
  await loadSettingsIntoEnv();
  // Previews die with the server (a restart or an image rebuild). Bring back every product that has a
  // built app, a few at a time, in the background.
  const { resumePreviews } = await import("@/lib/preview");
  setTimeout(() => void resumePreviews().catch((e) => console.error("resume previews", e)), 3000);
  // Socra's turns that a restart cut off are taken up again (an item never waits for its product to be opened).
  const { resumeAll } = await import("@/lib/agent/runner");
  setTimeout(() => void resumeAll().catch((e) => console.error("resume turns", e)), 8000);
  // What is waiting on people goes out by email, Slack or webhook (Settings > Connect).
  const { startNotifier } = await import("@/lib/notify");
  startNotifier();
}
