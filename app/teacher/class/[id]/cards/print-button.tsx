"use client";

export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex min-h-11 items-center rounded-lg border border-zinc-300 px-4 focus-visible:outline-2 focus-visible:outline-blue-600 print:hidden dark:border-zinc-700"
    >
      {label}
    </button>
  );
}
