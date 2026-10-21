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
      <Link href="/teacher" className="text-sm text-zinc-600 underline dark:text-zinc-400">
        All classes
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight">{className}</h1>
      <nav
        aria-label="Class pages"
        className="flex flex-wrap gap-1 border-b border-zinc-200 dark:border-zinc-800"
      >
        {TABS.map(([path, label]) => (
          <Link
            key={path}
            href={`/teacher/class/${classId}${path ? `/${path}` : ""}`}
            aria-current={current === path ? "page" : undefined}
            className={`inline-flex min-h-11 items-center px-3 focus-visible:outline-2 focus-visible:outline-blue-600 ${current === path ? "border-b-2 border-zinc-900 font-semibold dark:border-zinc-100" : "text-zinc-600 dark:text-zinc-400"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
