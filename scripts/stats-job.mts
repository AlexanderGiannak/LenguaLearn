// The nightly stats job: Railway's "stats" cron service runs this once a night inside the
// private network (see .railway/railway.ts). Locally: `npm run review:stats`.
import postgres from "postgres";
import { runStatsJob } from "../lib/review/stats-job.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });
try {
  const r = await runStatsJob(sql);
  console.log(
    `Stats job: ${r.senses} senses with answers; ${r.raised} new flags, ${r.updated} updated, ${r.quiet} held back after a recent review.`,
  );
} catch (e) {
  console.error("Stats job failed", e);
  process.exitCode = 1;
} finally {
  await sql.end();
}
