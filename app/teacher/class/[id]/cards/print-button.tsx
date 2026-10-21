"use client";

export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="btn btn-secondary px-4 focus-visible:outline-2 focus-visible:outline-brand-600 print:hidden"
    >
      {label}
    </button>
  );
}
