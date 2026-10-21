"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

// Small shared pieces for forms. 44px targets, visible focus, light and dark.

export const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";
export const muted = "text-zinc-600 dark:text-zinc-400";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" }) {
  const look = {
    primary:
      "bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300",
    secondary:
      "border border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800",
    danger: "bg-red-700 text-white hover:bg-red-800",
  }[variant];
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex min-h-11 items-center justify-center rounded-lg px-5 font-medium disabled:opacity-50 ${look} ${focusRing} ${className}`}
    />
  );
}

export function Field({
  label,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-medium">{label}</span>
      <input
        {...props}
        className={`min-h-11 rounded-lg border border-zinc-300 bg-transparent px-3 text-lg dark:border-zinc-700 ${focusRing}`}
      />
      {hint && <span className={`text-sm ${muted}`}>{hint}</span>}
    </label>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="rounded-md bg-red-50 p-3 text-red-900 dark:bg-red-950 dark:text-red-100"
    >
      {children}
    </p>
  );
}

export function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      {children}
    </main>
  );
}

/** POSTs JSON and returns the reply, or a readable error. */
export async function postJson<T = unknown>(
  url: string,
  body: unknown,
  method = "POST",
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      issues?: { message: string }[];
    };
    if (!res.ok) {
      return {
        ok: false,
        error: data.issues?.[0]?.message ?? data.error ?? "Something went wrong.",
      };
    }
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: "Can't reach the server. Check your connection and try again." };
  }
}
