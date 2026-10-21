import Link from "next/link";

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
      <Link href="/teacher" className="text-sm text-ink-600 underline dark:text-ink-400">
        All classes
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight">{className}</h1>
      <nav
        aria-label="Class pages"
        className="flex flex-wrap gap-1 border-b border-ink-200 dark:border-ink-800"
      >
        {TABS.map(([path, label]) => (
          <Link
            key={path}
            href={`/teacher/class/${classId}${path ? `/${path}` : ""}`}
            aria-current={current === path ? "page" : undefined}
            className={`inline-flex min-h-11 items-center px-3 focus-visible:outline-2 focus-visible:outline-brand-600 ${current === path ? "border-b-2 border-ink-900 font-semibold dark:border-ink-100" : "text-ink-600 dark:text-ink-400"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
