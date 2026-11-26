// The nightly stats job (spec: Content pipeline, step 5). Railway's cron service runs it
// through scripts/stats-job.mts. Plain SQL and relative imports only, so that script runs
// under plain Node without the app's bundler.
//
// It reads answers only as totals per sense and question type; nothing about one learner
// is kept or leaves the database.

import type { Sql } from "postgres";
import { INTEGRITY_CONFIG } from "../integrity/config.ts";
import { findFlags, STATS_CONFIG, type SenseTypeStats, type WrongPick } from "./stats.ts";

export type StatsJobResult = { senses: number; raised: number; updated: number; quiet: number };

export async function runStatsJob(
  sql: Sql,
  now = new Date(),
  config: typeof STATS_CONFIG = STATS_CONFIG,
): Promise<StatsJobResult> {
  // Times and JSON go in as strings: drizzle, when it shares this client, replaces its Date
  // and JSON handling.
  const at = (d: Date) => d.toISOString();
  const from = at(new Date(now.getTime() - config.windowDays * 86_400_000));
  const until = at(now);

  // Answers that count: in the window, not integrity-flagged (when answered or later, by
  // the streak rules in answer_flag), not pretests (guesses before a word is taught), to
  // senses still in use, and newer than the last time a reviewer closed that sense's flags
  // (a fix starts its numbers again).
  //
  // Response times are bounded by the server's clock as training bounds them (checkTiming):
  // a client time longer than issue-to-receive plus the tolerance counts as that span.
  const counted = sql`
    select e.sense_id, coalesce(s.level, 0) as level, e.question_type, e.correct, e.dont_know,
           case when e.client_response_ms > el.ms + ${INTEGRITY_CONFIG.clockToleranceMs}
                then el.ms else e.client_response_ms end as client_response_ms,
           e.options, e.chosen_index
    from answer_event e
    cross join lateral (
      select extract(epoch from (e.server_received_at - e.server_issued_at)) * 1000 as ms
    ) el
    join sense s on s.id = e.sense_id and s.status <> 'retired'
    left join (
      select sense_id, max(resolved_at) as closed from content_flag group by sense_id
    ) c on c.sense_id = e.sense_id
    where e.server_received_at >= ${from}::timestamptz
      and e.server_received_at <= ${until}::timestamptz
      and not e.flagged and not e.is_pretest
      and not exists (select 1 from answer_flag af where af.answer_event_id = e.id)
      and (c.closed is null or e.server_received_at > c.closed)`;

  const stats = await sql<
    {
      sense_id: number;
      level: number;
      question_type: string;
      answers: number;
      correct: number;
      ratio: number | null;
    }[]
  >`
    with a as (${counted}),
    typical as (
      select question_type, percentile_cont(0.5) within group (order by client_response_ms) as med
      from a where not dont_know and client_response_ms > 0
      group by question_type
    )
    select a.sense_id, a.level, a.question_type,
           count(*)::int as answers,
           (count(*) filter (where a.correct))::int as correct,
           percentile_cont(0.5) within group (order by a.client_response_ms / nullif(t.med, 0))
             filter (where not a.dont_know and a.client_response_ms > 0) as ratio
    from a left join typical t using (question_type)
    group by a.sense_id, a.level, a.question_type`;

  const picks = await sql<
    { sense_id: number; question_type: string; option: string | null; picks: number }[]
  >`
    with a as (${counted})
    select sense_id, question_type, options -> chosen_index::int ->> 'text' as option,
           count(*)::int as picks
    from a
    where not correct and chosen_index is not null
      and jsonb_typeof(options) = 'array'
      and jsonb_array_length(options) >= ${config.distractorMinOptions}
    group by 1, 2, 3`;

  const flags = findFlags(
    stats.map((r): SenseTypeStats => ({
      senseId: r.sense_id,
      level: r.level,
      questionType: r.question_type,
      answers: r.answers,
      correct: r.correct,
      medianTimeRatio: r.ratio === null ? null : Number(r.ratio),
    })),
    picks
      .filter((r) => r.option !== null)
      .map((r): WrongPick => ({
        senseId: r.sense_id,
        questionType: r.question_type,
        option: r.option!,
        picks: r.picks,
      })),
    config,
  );

  const result: StatsJobResult = {
    senses: new Set(stats.map((r) => r.sense_id)).size,
    raised: 0,
    updated: 0,
    quiet: 0,
  };
  const quietFrom = at(new Date(now.getTime() - config.quietDaysAfterReview * 86_400_000));
  for (const f of flags) {
    await sql.begin(async (tx) => {
      const updated = await tx`
        update content_flag set detail = ${JSON.stringify(f.detail)}::jsonb
        where sense_id = ${f.senseId} and kind = ${f.kind} and resolved_at is null`;
      if (updated.count > 0) return void result.updated++;
      // A reviewer looked at this recently: don't raise it again straight away.
      const [recent] = await tx`
        select 1 from content_flag
        where sense_id = ${f.senseId} and kind = ${f.kind} and resolved_at >= ${quietFrom}::timestamptz
        limit 1`;
      if (recent) return void result.quiet++;
      await tx`
        insert into content_flag (sense_id, kind, detail, at)
        values (${f.senseId}, ${f.kind}, ${JSON.stringify(f.detail)}::jsonb, ${until}::timestamptz)
        on conflict do nothing`;
      result.raised++;
    });
  }
  return result;
}
