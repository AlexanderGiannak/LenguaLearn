// Seat name labels (spec: Local-only name labels). They live only in this browser's
// localStorage and are never sent to the server: no request, URL, header or log.

export type Labels = Record<string, string>;
const key = (classId: string) => `lengualearn.labels.${classId}`;

export function loadLabels(classId: string): Labels {
  try {
    return JSON.parse(localStorage.getItem(key(classId)) ?? "{}") as Labels;
  } catch {
    return {};
  }
}

export function saveLabels(classId: string, labels: Labels): void {
  try {
    localStorage.setItem(key(classId), JSON.stringify(labels));
  } catch {
    // Storage blocked or full: labels just won't persist on this computer.
  }
}

/** A file the teacher can carry to another computer. Keyed by seat ID. */
export function labelsFile(classId: string, className: string, labels: Labels): Blob {
  return new Blob([JSON.stringify({ app: "LenguaLearn", classId, className, labels }, null, 2)], {
    type: "application/json",
  });
}

export async function readLabelsFile(file: File, classId: string): Promise<Labels> {
  const data = JSON.parse(await file.text()) as { classId?: string; labels?: unknown };
  if (data.classId !== classId) throw new Error("This file is for a different class.");
  const labels: Labels = {};
  for (const [k, v] of Object.entries((data.labels ?? {}) as Record<string, unknown>)) {
    if (typeof v === "string") labels[k] = v.slice(0, 80);
  }
  return labels;
}
