"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { NAV } from "./nav";
import { focusRing } from "./styles";

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

/** What the header offers: on the real site a demo link, on the demo site sign-in. */
export type HeaderProps = { demoHref: string | null };

/**
 * The header for the current page. With Cache Components on, usePathname suspends on
 * routes with request-time params (/word/[id], the teacher pages), so the layout wraps
 * this in Suspense with <HeaderBar /> as the fallback. None of those routes hide it.
 */
export function SiteHeader(props: HeaderProps) {
  const path = usePathname();
  if (BARE.some((p) => path === p || path.startsWith(`${p}/`))) return null;
  return <HeaderBar {...props} />;
}

const navLink = `inline-flex min-h-11 shrink-0 items-center rounded-lg px-3 font-semibold text-ink-600 hover:text-ink-900 dark:text-ink-400 dark:hover:text-ink-100 ${focusRing}`;

/**
 * Renders its children except on the full-screen routes. Used for the footer, which the
 * layout wraps in Suspense with the footer itself as the fallback, like the header.
 */
export function HideOnBare({ children }: { children: ReactNode }) {
  const path = usePathname();
  if (BARE.some((p) => path === p || path.startsWith(`${p}/`))) return null;
  return children;
}

/**
 * Where a signed-in visitor's home is, or null. Asked from the browser because the header
 * is part of the static shell; the session cookie is HTTP-only.
 */
function useHomeHref(): string | null {
  const [home, setHome] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/auth/get-session")
      .then((r) => (r.ok ? r.json() : null))
      .then((s: { user?: { role?: string } } | null) => {
        if (live && s?.user) setHome(s.user.role === "teacher" ? "/teacher" : "/home");
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return home;
}

export function HeaderBar({ demoHref }: HeaderProps) {
  const home = useHomeHref();
  return (
    <header className="border-b-2 border-ink-100 print:hidden dark:border-ink-900">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-2 px-4">
        <Link
          href="/"
          className={`mr-auto inline-flex min-h-11 items-center gap-2 rounded-lg text-xl font-extrabold tracking-tight lg:mr-4 ${focusRing}`}
        >
          <LogoMark />
          LenguaLearn
        </Link>
        <nav aria-label="Site" className="hidden flex-1 items-center lg:flex">
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} className={navLink}>
              {label}
            </Link>
          ))}
        </nav>
        {home ? (
          <Link href={home} className={`btn btn-secondary min-h-11 px-4 ${focusRing}`}>
            My home
          </Link>
        ) : demoHref ? (
          <a href={demoHref} className={`btn btn-primary min-h-11 px-4 ${focusRing}`}>
            Try the demo
          </a>
        ) : (
          <Link href="/sign-in" className={`btn btn-secondary min-h-11 px-4 ${focusRing}`}>
            Sign in
          </Link>
        )}
      </div>
      {/* Phones and narrow windows: the same links on a second row that scrolls sideways. */}
      <nav
        aria-label="Site, compact"
        className="mx-auto flex w-full max-w-5xl gap-1 overflow-x-auto px-2 pb-2 lg:hidden"
      >
        {NAV.map(([href, label]) => (
          <Link key={href} href={href} className={navLink}>
            {label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
