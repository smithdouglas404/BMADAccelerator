// Runs once when the server starts: copies the keys and models saved on the Settings page into process.env.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { loadSettingsIntoEnv } = await import("@/lib/settings");
  await loadSettingsIntoEnv();
}
