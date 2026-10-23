// Runs once when the server starts. On the deployed demo site it keeps the ready-made demo
// accounts fresh: an unvisited pool goes stale after half a day, and a four-week class takes
// a couple of minutes to build, too long to make a visitor wait.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { demoPrebuild, DEMO_CONFIG } = await import("@/lib/demo/config");
  // Deployed only: locally and in tests the pools fill after a visit, if at all.
  if (!demoPrebuild(process.env) || !process.env.RAILWAY_ENVIRONMENT_NAME) return;
  const { cleanupDemoAccounts, refillDemoPools } = await import("@/lib/demo/service");
  const tick = async () => {
    try {
      await cleanupDemoAccounts();
      await refillDemoPools();
    } catch (e) {
      console.error("demo pool refill failed", e);
    }
  };
  setTimeout(tick, 30_000).unref();
  setInterval(tick, DEMO_CONFIG.refillEveryMs).unref();
}
