"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { focusRing, link, muted } from "./styles";

export { focusRing, link, muted } from "./styles";

// Small shared pieces for forms. 44px targets, visible focus, light and dark.

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" }) {
  // Written out in full: Tailwind only generates classes it can find in the source.
  const look = { primary: "btn-primary", secondary: "btn-secondary", danger: "btn-danger" }[
    variant
  ];
  return <button type="button" {...props} className={`btn ${look} ${focusRing} ${className}`} />;
}

export function Field({
  label,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-semibold">{label}</span>
      <input {...props} className={`field text-lg ${focusRing}`} />
      {hint && <span className={`text-sm ${muted}`}>{hint}</span>}
    </label>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="rounded-xl border-2 border-red-200 bg-red-50 p-3 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100"
    >
      {children}
    </p>
  );
}

export function Page({
  title,
  back,
  children,
}: {
  title: string;
  /** A small link above the title, such as back to the learner's home. */
  back?: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-10">
      {back && (
        <a href={back.href} className={`${link} -mb-3 self-start text-sm`}>
          ← {back.label}
        </a>
      )}
      <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
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
