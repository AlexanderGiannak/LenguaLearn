"use client";

import { useEffect, useState } from "react";
import { focusRing, muted } from "@/app/_components/ui";
import {
  getAutoplay,
  getTheme,
  setAutoplay,
  setTheme,
  type Theme,
} from "@/app/_components/preferences";

export function PreferencesPanel() {
  const [theme, setThemeState] = useState<Theme>("system");
  const [autoplay, setAutoplayState] = useState(false);
  useEffect(() => {
    const t = getTheme();
    const a = getAutoplay();
    queueMicrotask(() => {
      setThemeState(t);
      setAutoplayState(a);
    });
  }, []);
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-bold">On this device</h2>
      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          className="h-5 w-5"
          checked={autoplay}
          onChange={(e) => {
            setAutoplay(e.target.checked);
            setAutoplayState(e.target.checked);
          }}
        />
        <span>Play each new word&apos;s audio automatically</span>
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-medium">Theme</span>
        <select
          value={theme}
          onChange={(e) => {
            const t = e.target.value as Theme;
            setTheme(t);
            setThemeState(t);
          }}
          className={`min-h-11 w-48 field ${focusRing}`}
        >
          <option value="system">Match this device</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
      <p className={`text-sm ${muted}`}>These stay in this browser.</p>
    </section>
  );
}
