// Per-device preferences (spec: Settings): audio autoplay and theme. Kept in this browser's
// localStorage; nothing about them is sent to the server.

export type Theme = "system" | "light" | "dark";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the preference just won't persist.
  }
}

export function getAutoplay(): boolean {
  return read("lengualearn.autoplay") === "on";
}
export function setAutoplay(on: boolean) {
  write("lengualearn.autoplay", on ? "on" : null);
}

export function getTheme(): Theme {
  const t = read("lengualearn.theme");
  return t === "light" || t === "dark" ? t : "system";
}
export function setTheme(theme: Theme) {
  write("lengualearn.theme", theme === "system" ? null : theme);
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}
