"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { focusRing } from "./ui";

/** The brand mark: a speech bubble with a tilde. */
export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <path
        d="M6 4h20a4 4 0 0 1 4 4v13a4 4 0 0 1-4 4H14l-6 5v-5H6a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4z"
        className="fill-brand-600 dark:fill-brand-500"
      />
      <path
        d="M9 15.5c1.6-2.4 3.6-2.4 5.4-.6 1.9 1.9 3.9 1.9 5.6-.6"
        fill="none"
        stroke="#fff"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Training and the level test are full-screen tasks: no header to wander off through.
const BARE = ["/train", "/placement"];

/**
 * The header for the current page. With Cache Components on, usePathname suspends on
 * routes with request-time params (/word/[id], the teacher pages), so the layout wraps
 * this in Suspense with <HeaderBar /> as the fallback. None of those routes hide it.
 */
export function SiteHeader() {
  const path = usePathname();
  if (BARE.some((p) => path === p || path.startsWith(`${p}/`))) return null;
  return <HeaderBar />;
}

export function HeaderBar() {
  return (
    <header className="border-b-2 border-ink-100 print:hidden dark:border-ink-900">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center px-4">
        <Link
          href="/"
          className={`inline-flex min-h-11 items-center gap-2 rounded-lg text-xl font-extrabold tracking-tight ${focusRing}`}
        >
          <LogoMark />
          LenguaLearn
        </Link>
      </div>
    </header>
  );
}
