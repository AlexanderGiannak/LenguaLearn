import { isDemoSite } from "@/lib/demo/config";

// The real site (lengualearn.com) opens accounts once reviewed words and email are ready;
// until then it shows "Opening soon" and sends visitors to the demo site (docs/DECISIONS.md).

/**
 * Whether new accounts can be created. Always on the demo site and everywhere that isn't
 * Railway production (local, CI, PR previews); in production only with SIGNUPS_OPEN=1.
 */
export function signupsOpen(env: Record<string, string | undefined>): boolean {
  if (isDemoSite(env) || env.SIGNUPS_OPEN === "1") return true;
  return env.RAILWAY_ENVIRONMENT_NAME !== "production";
}

/** Where the real site's "Try the demo" buttons go. */
export function demoUrl(env: Record<string, string | undefined>): string {
  return env.DEMO_URL ?? "https://demo.lengualearn.com";
}

/** "Try the demo" target: the demo site from the real site, its own landing page on the demo. */
export function tryDemoHref(env: Record<string, string | undefined>): string {
  return isDemoSite(env) ? "/" : demoUrl(env);
}
