// Which stored document an evidence card came from. Uploads record the document id; evidence that Socra
// or the document agent filed later often names the file in its source line instead ("Agentic map
// (bacc/advisor/agentic-map.md)", "Hello Earth business case (uploaded .docx)"). Plain matching, no AI:
// the recorded id first, then a workspace path named in the source, then the file's own name.

export type DocLike = { id: string; fileName: string; storagePath: string; textPath?: string; origin?: string; createdAt: string | Date };
export type EvidenceLike = { id: string; source: string; documentId: string };

const words = (s: string) => s.toLowerCase().replace(/\.[a-z0-9]{1,5}$/i, "").replace(/^[0-9a-f]{8}(-[0-9a-f]{4}){0,4}(-[0-9a-f]{12})?-/i, "").replace(/[^a-z0-9]+/g, " ").trim();

const newest = <T extends DocLike>(docs: T[]) =>
  [...docs].sort((a, b) => Number(Boolean(b.textPath)) - Number(Boolean(a.textPath)) || Number(b.origin === "upload") - Number(a.origin === "upload") || +new Date(b.createdAt) - +new Date(a.createdAt))[0];

export function documentFor<T extends DocLike>(e: EvidenceLike, docs: T[]): T | undefined {
  if (e.documentId) {
    const d = docs.find((x) => x.id === e.documentId);
    if (d) return d;
  }
  const source = e.source || "";
  if (!source.trim() || !docs.length) return undefined;
  // A path named in the source line (anything with a slash and an extension).
  const paths = source.match(/[\w.\-]+(?:\/[\w.\-]+)+\.[a-z0-9]{1,5}/gi) ?? [];
  for (const p of paths) {
    const hit = docs.filter((d) => d.storagePath.replace(/\\/g, "/").endsWith(`/${p}`) || d.storagePath.endsWith(p));
    if (hit.length) return newest(hit);
  }
  // A file name named in the source line ("hello-earth-business-case.docx").
  const names = source.match(/[\w.\-]+\.[a-z0-9]{1,5}\b/gi) ?? [];
  for (const n of names) {
    const hit = docs.filter((d) => d.fileName.toLowerCase() === n.toLowerCase() || d.storagePath.toLowerCase().endsWith(n.toLowerCase()));
    if (hit.length) return newest(hit);
  }
  // The file's name in words ("Hello Earth business case (uploaded .docx)" ↔ hello-earth-business-case.docx).
  const said = ` ${words(source)} `;
  const hit = docs.filter((d) => {
    const w = words(d.fileName);
    return w.split(" ").length >= 2 && said.includes(` ${w} `);
  });
  if (hit.length) {
    const ext = source.match(/\.(\w{2,5})\b/)?.[1]?.toLowerCase();
    const sameExt = ext ? hit.filter((d) => d.fileName.toLowerCase().endsWith(`.${ext}`)) : [];
    return newest(sameExt.length ? sameExt : hit);
  }
  return undefined;
}

/** Evidence with documentId filled in wherever its document can be found. */
export function withDocuments<E extends EvidenceLike, D extends DocLike>(evidence: E[], docs: D[]): E[] {
  return evidence.map((e) => ({ ...e, documentId: documentFor(e, docs)?.id ?? "" }));
}
