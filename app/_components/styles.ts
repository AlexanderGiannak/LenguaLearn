// Shared class strings. A plain module (not "use client"), so server components can import
// them too: a server component importing a value from a client module gets a reference
// placeholder, not the string.

export const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600";
export const muted = "text-ink-600 dark:text-ink-400";
export const link = `font-semibold text-brand-700 underline decoration-2 underline-offset-4 hover:text-brand-800 dark:text-brand-300 dark:hover:text-brand-200 ${focusRing}`;
