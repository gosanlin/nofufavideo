import type { Episode, Title } from "./types";
import type { Dub } from "./dubs";

function normTitleName(name: string): string {
  return String(name ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\((19|20)\d{2}\)/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function uniqueStrings(arr: (string | undefined | null)[]): string[] {
  return [...new Set(arr.filter((x): x is string => !!x))];
}

function mergeDubs(a?: Dub[], b?: Dub[]): Dub[] {
  const byLang = new Map<string, Dub>();
  const push = (d: Dub) => {
    const lang = d.lang || "DUAL";
    const urls = uniqueStrings([d.url, ...(d.servers ?? []), ...(d.mirrors ?? [])]);
    const existing = byLang.get(lang);
    if (!existing) {
      byLang.set(lang, { ...d, lang, url: d.url || urls[0] || "", servers: urls, mirrors: urls });
    } else {
      const servers = uniqueStrings([...(existing.servers ?? []), ...urls]);
      byLang.set(lang, { ...existing, servers, mirrors: servers, url: existing.url || urls[0] || "" });
    }
  };
  (a ?? []).forEach(push);
  (b ?? []).forEach(push);
  return [...byLang.values()];
}

export function mergeTitles(titles: Title[]): Title[] {
  const groups = new Map<string, Title[]>();
  for (const t of titles) {
    const key = `${t.kind}:${normTitleName(t.name)}`;
    const arr = groups.get(key) ?? [];
    arr.push(t);
    groups.set(key, arr);
  }
  const out: Title[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      out.push(group[0]);
      continue;
    }
    const metaOwner = group.find((t) => t.meta) ?? group[0];
    const images = group.reduce<Record<string, string> | undefined>(
      (acc, t) => ({ ...(acc ?? {}), ...(t.images ?? {}) }),
      metaOwner.images,
    );
    const base = group[0];
    const epMap = new Map<string, Episode>();
    for (const t of group) {
      for (const e of t.episodes) {
        const ek = `${e.season}x${e.number}${e.last ? `-${e.last}` : ""}`;
        const existing = epMap.get(ek);
        if (!existing) {
          const servers = uniqueStrings([e.url, ...(e.servers ?? []), ...(e.mirrors ?? [])]);
          const { dubs: _d, ...rest } = e;
          epMap.set(ek, {
            ...rest,
            titleId: base.id,
            servers,
            mirrors: servers,
            ...(e.dubs?.length ? { dubs: mergeDubs(e.dubs) } : {}),
          });
        } else {
          const servers = uniqueStrings([
            existing.url,
            e.url,
            ...(existing.servers ?? []),
            ...(e.servers ?? []),
            ...(existing.mirrors ?? []),
            ...(e.mirrors ?? []),
          ]);
          const dubs = mergeDubs(existing.dubs, e.dubs);
          const { dubs: _d, ...rest } = existing;
          epMap.set(ek, {
            ...rest,
            titleId: base.id,
            url: existing.url || e.url,
            name: existing.name && !/^Episodio \d+$/.test(existing.name) ? existing.name : e.name,
            duration: existing.duration ?? e.duration,
            added: Math.max(existing.added ?? 0, e.added ?? 0),
            servers,
            mirrors: servers,
            ...(dubs.length ? { dubs } : {}),
          });
        }
      }
    }
    const episodes = [...epMap.values()].sort((a, b) => a.season - b.season || a.number - b.number);
    out.push({
      id: base.id,
      name: base.name,
      kind: base.kind,
      episodes,
      images,
      meta: metaOwner.meta ?? base.meta,
      added: Math.max(0, ...group.map((t) => t.added ?? 0)),
    });
  }
  return out;
}