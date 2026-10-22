import { isDemoSite } from "@/lib/demo/config";

/** A strip on every page of the demo site, so nobody mistakes sample words for reviewed ones. */
export function DemoBanner() {
  if (!isDemoSite(process.env)) return null;
  return (
    <p className="bg-amber-100 px-4 py-2 text-center text-sm font-semibold text-amber-950 print:hidden dark:bg-amber-950 dark:text-amber-100">
      Demo site: the words are AI-written samples, not yet reviewed. Demo accounts are deleted after
      a day.
    </p>
  );
}
