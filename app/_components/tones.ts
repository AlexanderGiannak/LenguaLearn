// Accent colors for the public pages, so sections and cards aren't all one violet. Full
// class strings (Tailwind only sees classes written out in full). Decoration only: on charts,
// colors come from the --chart-* tokens instead.

export type Tone = "violet" | "coral" | "teal" | "sun" | "sky";

export const TONES: Record<
  Tone,
  {
    /** Tinted panel background and border. */
    soft: string;
    /** A filled badge or icon tile. */
    badge: string;
    /** Text on the soft background. */
    ink: string;
    /** Solid fill for decorative SVG shapes. */
    fill: string;
    /** Colored top edge on cards. */
    edge: string;
  }
> = {
  violet: {
    soft: "bg-brand-50 border-brand-100 dark:bg-brand-950/50 dark:border-brand-900",
    badge: "bg-brand-500 text-white dark:bg-brand-400 dark:text-brand-950",
    ink: "text-brand-800 dark:text-brand-200",
    fill: "fill-brand-500 dark:fill-brand-400",
    edge: "border-t-brand-400",
  },
  coral: {
    soft: "bg-orange-50 border-orange-100 dark:bg-orange-950/40 dark:border-orange-900/70",
    badge: "bg-orange-500 text-white dark:bg-orange-400 dark:text-orange-950",
    ink: "text-orange-800 dark:text-orange-200",
    fill: "fill-orange-500 dark:fill-orange-400",
    edge: "border-t-orange-400",
  },
  teal: {
    soft: "bg-teal-50 border-teal-100 dark:bg-teal-950/40 dark:border-teal-900/70",
    badge: "bg-teal-600 text-white dark:bg-teal-400 dark:text-teal-950",
    ink: "text-teal-800 dark:text-teal-200",
    fill: "fill-teal-500 dark:fill-teal-400",
    edge: "border-t-teal-400",
  },
  sun: {
    soft: "bg-amber-50 border-amber-100 dark:bg-amber-950/40 dark:border-amber-900/70",
    badge: "bg-amber-400 text-amber-950 dark:bg-amber-300 dark:text-amber-950",
    ink: "text-amber-900 dark:text-amber-200",
    fill: "fill-amber-400 dark:fill-amber-300",
    edge: "border-t-amber-400",
  },
  sky: {
    soft: "bg-sky-50 border-sky-100 dark:bg-sky-950/40 dark:border-sky-900/70",
    badge: "bg-sky-500 text-white dark:bg-sky-400 dark:text-sky-950",
    ink: "text-sky-800 dark:text-sky-200",
    fill: "fill-sky-500 dark:fill-sky-400",
    edge: "border-t-sky-400",
  },
};

/** The order sections and cards cycle through. */
export const TONE_CYCLE: Tone[] = ["violet", "coral", "teal", "sun", "sky"];

export const toneAt = (i: number) => TONES[TONE_CYCLE[i % TONE_CYCLE.length]!];
