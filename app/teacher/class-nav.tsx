import Link from "next/link";
import { link } from "@/app/_components/styles";

const TABS = [
  ["", "Dashboard"],
  ["seats", "Seats"],
  ["insights", "Insights"],
  ["grades", "Grades"],
  ["settings", "Settings"],
  ["cards", "Printable cards"],
] as const;

export function ClassNav({
  classId,
  className,
  current,
}: {
  classId: string;
  className: string;
  current: (typeof TABS)[number][0];
}) {
  return (
    <header className="flex flex-col gap-3 print:hidden">
      <Link href="/teacher" className={`${link} self-start text-sm`}>
        All classes
      </Link>
      <h1 className="text-3xl font-extrabold tracking-tight">{className}</h1>
      <nav
        aria-label="Class pages"
        className="flex flex-wrap gap-1 border-b-2 border-ink-100 dark:border-ink-800"
      >
        {TABS.map(([path, label]) => (
          <Link
            key={path}
            href={`/teacher/class/${classId}${path ? `/${path}` : ""}`}
            aria-current={current === path ? "page" : undefined}
            className={`inline-flex min-h-11 items-center px-3 focus-visible:outline-2 focus-visible:outline-brand-600 ${current === path ? "-mb-0.5 border-b-4 border-brand-500 font-bold text-brand-700 dark:text-brand-300" : "font-semibold text-ink-600 hover:text-ink-900 dark:text-ink-400 dark:hover:text-ink-100"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
