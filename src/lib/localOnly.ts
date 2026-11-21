/**
 * Pages that open only on the computer the Studio runs on (Doug, Nov 21): Settings > Agent memory shows
 * every customer's agent memory, and the Studio has no sign-in yet, so it is closed on the public address
 * (studio.innume.com and p<port>.innume.com, through the Cloudflare tunnel) until sign-in is on.
 *
 * A request counts as local only when it names a loopback host and carries none of the headers Cloudflare
 * adds on its way through the tunnel. Pure function: tested in tests/memoryview.test.mjs.
 */
const CLOUDFLARE = ["cf-connecting-ip", "cf-ray", "cf-visitor", "cf-ipcountry", "cdn-loop"];
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

type HeaderLike = { get(name: string): string | null };

export function isLocalRequest(h: HeaderLike): boolean {
  if (CLOUDFLARE.some((k) => h.get(k))) return false;
  const hosts = [h.get("host"), h.get("x-forwarded-host")].filter((x): x is string => Boolean(x));
  if (!hosts.length) return false;
  return hosts.every((v) => v.split(",").every((one) => {
    const host = one.trim().toLowerCase();
    const name = host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0];
    return LOOPBACK.has(name);
  }));
}

export const LOCAL_ONLY_MESSAGE = "Agent memory opens only on the computer the Studio runs on (http://localhost:3000) until sign-in is turned on.";
