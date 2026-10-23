import { defineRailway, github, postgres, preserve, project, service } from "railway/iac";

// US East (Virginia). Everything that touches student data runs in this one region.
const REGION = "us-east4-eqdc4a";

export default defineRailway((ctx) => {
  // Two environments from this one file: production (lengualearn.com, the real site) and
  // demo (try.lengualearn.com: sample words and one-click accounts, its own database).
  const demo = ctx.isEnvironment("demo");
  const site = demo ? "try.lengualearn.com" : "lengualearn.com";

  // The app reaches Postgres only over Railway's private network. The public TCP
  // proxy Railway adds to new databases is removed (see docs/DECISIONS.md).
  // No explicit region: its volume lives in "iad" (US East, Virginia), the same place as
  // the app, and naming the region here makes Railway plan a destructive "move".
  const db = postgres("postgres");

  const web = service("web", {
    // No "wait for CI" (checkSuites): it also waited on other GitHub apps' check suites that
    // never finish, so main never deployed. Branch protection already requires green CI
    // before anything reaches main.
    source: github("AlexanderGiannak/LenguaLearn", { branch: "main", checkSuites: false }),
    build: "npm run build",
    // Runs inside the private network before the new version takes traffic.
    preDeploy: "npm run db:migrate",
    start: "npm run start",
    // A new version only takes traffic once this returns 200 (database reachable).
    healthcheck: "/api/health",
    healthcheckTimeout: 120,
    // One server on purpose: in-memory rate limiting stays valid (spec, "One Railway server").
    replicas: { [REGION]: 1 },
    // www redirects to the bare domain (next.config.ts). demo.lengualearn.com stays attached
    // until Let's Encrypt's rate limit lets its certificate through (docs/DECISIONS.md).
    domains: demo ? [site, "demo.lengualearn.com"] : [site, "www.lengualearn.com"],
    env: {
      DATABASE_URL: db.env.DATABASE_URL,
      // PR environments copy this but use their own generated domain (lib/auth/base-url.ts).
      BETTER_AUTH_URL: `https://${site}`,
      ...(demo ? { DEMO_SITE: "1" } : {}),
      // Set by hand with `railway variables`, never written in source (see .env.example).
      ADMIN_API_TOKEN_HASH: preserve(),
      BETTER_AUTH_SECRET: preserve(),
    },
  });

  return project("lengualearn", { resources: [db, web] });
});
