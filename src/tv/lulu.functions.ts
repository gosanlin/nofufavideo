import { createServerFn } from "@tanstack/react-start";

export interface RawLulu {
  code: string;
  title: string;
  thumb: string;
  length: string;
}

/** Lista en directo de LuluStream usando la clave guardada en el servidor (LULU_API_KEY). */
export const getLuluFiles = createServerFn({ method: "GET" }).handler(async () => {
  const key = process.env["LULU_API_KEY"];
  if (!key) return { ok: false as const, files: [] as RawLulu[] };
  const files: RawLulu[] = [];
  for (let page = 1; page <= 50; page++) {
    const r = await fetch(
      `https://api.lulustream.com/api/file/list?key=${encodeURIComponent(key)}&per_page=200&page=${page}`,
    );
    const j = (await r.json()) as {
      status?: number;
      result?: { files?: { file_code: string; title?: string; thumbnail?: string; length?: string | number }[] };
    };
    if (j.status !== 200) break;
    const list = j.result?.files ?? [];
    for (const f of list)
      files.push({
        code: f.file_code,
        title: f.title || f.file_code,
        thumb: f.thumbnail || "",
        length: f.length ? String(f.length) : "",
      });
    if (list.length < 200) break;
  }
  return { ok: true as const, files };
});
