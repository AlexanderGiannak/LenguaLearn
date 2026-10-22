import Link from "next/link";
import { NAV } from "./nav";
import { LogoMark } from "./site-header";
import { focusRing } from "./styles";

const footerLink = `inline-flex min-h-11 items-center rounded font-semibold text-ink-600 hover:text-ink-900 dark:text-ink-400 dark:hover:text-ink-100 ${focusRing}`;

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t-2 border-ink-100 bg-ink-50 print:hidden dark:border-ink-900 dark:bg-ink-950">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10 sm:flex-row sm:justify-between">
        <div className="flex max-w-sm flex-col gap-2">
          <p className="flex items-center gap-2 text-lg font-extrabold">
            <LogoMark className="h-6 w-6" /> LenguaLearn
          </p>
          <p className="text-ink-600 dark:text-ink-400">
            Spanish vocabulary in short daily sessions. Free, with no ads, and no selling data.
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-col gap-0 sm:items-end">
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} className={footerLink}>
              {label}
            </Link>
          ))}
          <Link href="/sign-in" className={footerLink}>
            Sign in
          </Link>
        </nav>
      </div>
    </footer>
  );
}
