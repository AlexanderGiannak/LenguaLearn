import { defineRailway, github, postgres, preserve, project, service } from "railway/iac";

// US East (Virginia). Everything that touches student data runs in this one region.
const REGION = "us-east4-eqdc4a";

export default defineRailway(() => {
  // The app reaches Postgres only over Railway's private network. The public TCP
  // proxy Railway adds to new databases is removed (see docs/DECISIONS.md).
  // No explicit region: its volume lives in "iad" (US East, Virginia), the same place as
  // the app, and naming the region here makes Railway plan a destructive "move".
  const db = postgres("postgres");

  const web = service("web", {
    // checkSuites: Railway waits for GitHub CI to pass before deploying a commit.
    source: github("AlexanderGiannak/LenguaLearn", { branch: "main", checkSuites: true }),
    build: "npm run build",
    // Runs inside the private network before the new version takes traffic.
    preDeploy: "npm run db:migrate",
    start: "npm run start",
    // A new version only takes traffic once this returns 200 (database reachable).
    healthcheck: "/api/health",
    healthcheckTimeout: 120,
    // One server on purpose: in-memory rate limiting stays valid (spec, "One Railway server").
    replicas: { [REGION]: 1 },
    env: {
      DATABASE_URL: db.env.DATABASE_URL,
      // Set by hand with `railway variables`, never written in source (see .env.example).
      ADMIN_API_TOKEN_HASH: preserve(),
    },
  });

  return project("lengualearn", { resources: [db, web] });
});
