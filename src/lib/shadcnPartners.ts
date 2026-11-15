// Which shadcn partner registries to set up (see shadcnLookupDir in provision.ts). No imports, so it can be tested.
export const DEFAULT_PARTNERS = ["@magicui", "@aceternity", "@originui", "@kokonutui", "@animate-ui", "@motion-primitives", "@cult-ui", "@reui", "@shadcnblocks", "@eldoraui"];
export function pickPartners(index: Record<string, string>, setting = process.env.BACC_SHADCN_REGISTRIES || ""): Record<string, string> {
  if (setting === "off") return {};
  const wanted = setting === "all" ? Object.keys(index) : setting ? setting.split(",").map((s) => s.trim()).filter(Boolean) : DEFAULT_PARTNERS;
  return Object.fromEntries(wanted.filter((n) => n !== "@shadcn" && typeof index[n] === "string").map((n) => [n, index[n]]));
}

