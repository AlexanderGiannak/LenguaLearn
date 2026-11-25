// Reads content/candidates.csv as the owner left it after editing by hand (spec: step 1).

export type CandidateRow = {
  rank: number;
  lemma: string;
  pos: string[];
  level: number;
  themes: string[];
  notes: string;
};

/** RFC 4180 CSV: quoted fields may hold commas, doubled quotes and newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  return rows;
}

/**
 * Parses the candidate list. Rows keep the file's order; the rank column is what the owner
 * typed, so reordering rows by hand without renumbering still works: the rank used is the
 * row's position.
 */
export function parseCandidates(text: string): CandidateRow[] {
  const [header, ...rows] = parseCsv(text.normalize("NFC"));
  if (!header) return [];
  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`candidates.csv has no "${name}" column`);
    return i;
  };
  const [lemma, pos, themes, notes] = ["lemma", "pos", "themes", "notes"].map(col) as number[];
  const seen = new Set<string>();
  return rows.map((r, i) => {
    const word = (r[lemma!] ?? "").trim();
    if (!word) throw new Error(`candidates.csv row ${i + 2} has no lemma`);
    if (seen.has(word)) throw new Error(`candidates.csv lists "${word}" twice`);
    seen.add(word);
    const rank = i + 1;
    return {
      rank,
      lemma: word,
      pos: (r[pos!] ?? "").split("|").filter(Boolean),
      level: Math.ceil(rank / 500),
      themes: (r[themes!] ?? "")
        .split(/[|;]/)
        .map((t) => t.trim())
        .filter(Boolean),
      notes: (r[notes!] ?? "").trim(),
    };
  });
}
