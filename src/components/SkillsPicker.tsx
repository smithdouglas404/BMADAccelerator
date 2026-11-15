"use client";

import { useMemo, useState } from "react";
import { ECC_SKILLS, FEATURED_GROUPS, humanize, skillById } from "@/lib/skills";

type Props = { selected: string[]; onChange: (ids: string[]) => void };

export default function SkillsPicker({ selected, onChange }: Props) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return ECC_SKILLS.filter((s) => s.id.includes(q) || s.description.toLowerCase().includes(q)).slice(0, 12);
  }, [query]);

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);

  const Tile = ({ id }: { id: string }) => {
    const s = skillById(id);
    if (!s) return null;
    const on = selected.includes(id);
    return (
      <button
        type="button"
        onClick={() => toggle(id)}
        aria-pressed={on}
        className={`rounded-xl border p-3 text-left transition ${
          on ? "border-accent bg-accent/10" : "border-line hover:border-accent/50"
        }`}
      >
        <div className="flex items-center justify-between gap-2 text-sm font-semibold">
          {humanize(id)}
          <span className={`h-4 w-4 rounded-full border ${on ? "border-accent bg-accent" : "border-line"}`} />
        </div>
        <p className="mt-1 line-clamp-2 text-xs text-muted">{s.description}</p>
      </button>
    );
  };

  return (
    <div className="space-y-5">
      {FEATURED_GROUPS.map((g) => (
        <div key={g.group}>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{g.group}</h4>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {g.ids.map((id) => (
              <Tile key={id} id={id} />
            ))}
          </div>
        </div>
      ))}
      <div>
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted" htmlFor="skill-search">
          Search all {ECC_SKILLS.length} ECC skills
        </label>
        <input
          id="skill-search"
          className="field"
          placeholder="e.g. payments, healthcare, accessibility"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {results.length > 0 && (
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((s) => (
              <Tile key={s.id} id={s.id} />
            ))}
          </div>
        )}
      </div>
      <p className="text-xs text-muted">
        Optional. You don&apos;t need to pick any to get started. {selected.length} selected.
      </p>
    </div>
  );
}
