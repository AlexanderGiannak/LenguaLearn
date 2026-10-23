"use client";

import { useState } from "react";
import type { PlacementStep, RecallPoint } from "@/lib/site/explainers";
import { AXIS_TEXT, NumbersTable, Tooltip, useWidth } from "./charts";
import { muted } from "./styles";

// Graphs for the public pages. The data comes from lib/site/explainers.ts (the real
// scheduler and placement test); these only draw it, with the same mark spec as charts.tsx.

const pct = (r: number) => `${Math.round(r * 100)}%`;

function LegendItem({ mark, children }: { mark: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <svg width="22" height="12" aria-hidden="true" className="shrink-0">
        {mark}
      </svg>
      <span className={muted}>{children}</span>
    </li>
  );
}

/** Predicted recall of one word over two months, reviewed on schedule or never again. */
export function ReviewCurves({
  withReviews,
  withoutReviews,
  reviewDays,
  target,
  height = 240,
}: {
  withReviews: RecallPoint[];
  withoutReviews: RecallPoint[];
  reviewDays: number[];
  target: number;
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>(560);
  const [hover, setHover] = useState<number | null>(null);
  const days = withReviews.at(-1)!.day;
  const pad = { left: 40, right: 12, top: 26, bottom: 26 };
  const lo = 0.5;
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const x = (d: number) => pad.left + (d / days) * plotW;
  const y = (r: number) => pad.top + ((1 - r) / (1 - lo)) * plotH;
  const path = (pts: RecallPoint[]) =>
    pts.map((p, i) => `${i ? "L" : "M"}${x(p.day).toFixed(1)},${y(p.recall).toFixed(1)}`).join("");
  const xTicks = Array.from({ length: Math.floor(days / 10) + 1 }, (_, i) => i * 10);
  // Whole days for the hover and the table.
  const daily = withReviews.flatMap((p, i) =>
    Number.isInteger(p.day) ? [{ day: p.day, on: p.recall, off: withoutReviews[i]!.recall }] : [],
  );
  const h = hover === null ? null : daily[hover]!;
  const end = withoutReviews.at(-1)!;
  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <LegendItem
          mark={
            <>
              <line
                x1="0"
                x2="22"
                y1="6"
                y2="6"
                strokeWidth="2"
                style={{ stroke: "var(--chart-1)" }}
              />
              <circle cx="11" cy="6" r="4" style={{ fill: "var(--chart-1)" }} />
            </>
          }
        >
          Reviewed when it&apos;s due (dots are reviews)
        </LegendItem>
        <LegendItem
          mark={
            <line
              x1="0"
              x2="22"
              y1="6"
              y2="6"
              strokeWidth="2"
              strokeDasharray="4 3"
              className="stroke-ink-400 dark:stroke-ink-500"
            />
          }
        >
          Never reviewed again
        </LegendItem>
        <LegendItem
          mark={
            <line
              x1="0"
              x2="22"
              y1="6"
              y2="6"
              strokeWidth="1"
              style={{ stroke: "var(--chart-goal)" }}
            />
          }
        >
          {pct(target)}: when a review comes due
        </LegendItem>
      </ul>
      <div ref={ref} className="relative w-full min-w-0" onPointerLeave={() => setHover(null)}>
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`Predicted recall of one word over ${days} days: reviewed when due it stays above ${pct(target)}; never reviewed again it falls to ${pct(end.recall)}.`}
          className="block max-w-full"
        >
          {[0.5, 0.75, 1].map((t) => (
            <g key={t}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={y(t)}
                y2={y(t)}
                strokeWidth="1"
                style={{ stroke: "var(--chart-grid)" }}
              />
              <text x={pad.left - 8} y={y(t) + 4} textAnchor="end" className={AXIS_TEXT}>
                {pct(t)}
              </text>
            </g>
          ))}
          {xTicks.map((d) => (
            <text
              key={d}
              x={x(d)}
              y={height - 6}
              textAnchor={d === 0 ? "start" : d === days ? "end" : "middle"}
              className={AXIS_TEXT}
            >
              {d === 0 ? "Day 0" : d === days ? `${d} days` : d}
            </text>
          ))}
          <line
            x1={pad.left}
            x2={width - pad.right}
            y1={y(target)}
            y2={y(target)}
            strokeWidth="1"
            style={{ stroke: "var(--chart-goal)" }}
          />
          <path
            d={path(withoutReviews)}
            fill="none"
            strokeWidth="2"
            strokeDasharray="5 4"
            className="stroke-ink-400 dark:stroke-ink-500"
          />
          <path
            d={path(withReviews)}
            fill="none"
            strokeWidth="2"
            strokeLinejoin="round"
            style={{ stroke: "var(--chart-1)" }}
          />
          {reviewDays.map((d) => (
            <circle
              key={d}
              cx={x(d)}
              cy={y(1)}
              r="5"
              strokeWidth="2"
              style={{ fill: "var(--chart-1)", stroke: "var(--surface)" }}
            />
          ))}
          <text
            x={width - pad.right}
            y={y(end.recall) - 12}
            textAnchor="end"
            className="fill-ink-600 text-xs font-semibold dark:fill-ink-300"
          >
            {pct(end.recall)} without reviews
          </text>
          {h && (
            <line
              x1={x(h.day)}
              x2={x(h.day)}
              y1={pad.top - 6}
              y2={height - pad.bottom}
              strokeWidth="1"
              className="stroke-ink-300 dark:stroke-ink-600"
            />
          )}
          {daily.map((d, i) => (
            <rect
              key={d.day}
              x={x(d.day) - plotW / days / 2}
              y={0}
              width={plotW / days}
              height={height}
              fill="transparent"
              onPointerEnter={() => setHover(i)}
            />
          ))}
        </svg>
        {h && (
          <Tooltip
            x={Math.min(Math.max(x(h.day), 90), width - 90)}
            y={pad.top}
            value={`${pct(h.on)} reviewed · ${pct(h.off)} not`}
            label={`Day ${h.day}`}
          />
        )}
      </div>
      <NumbersTable
        caption="Predicted recall by day"
        head={["Day", "Reviewed when due", "Never reviewed again"]}
        rows={daily.filter((d) => d.day % 5 === 0).map((d) => [d.day, pct(d.on), pct(d.off)])}
      />
    </div>
  );
}

/** Two memories per word: when each one is reviewed, on one shared day axis. */
export function TwoMemoryLanes({
  recognition,
  production,
  productionFrom,
  days,
}: {
  recognition: number[];
  production: number[];
  productionFrom: number;
  days: number;
}) {
  const at = (d: number) => `${(100 * d) / days}%`;
  const lanes = [
    {
      key: "recognition",
      label: "Recognition",
      note: "See the Spanish, know the meaning",
      from: 0,
      dots: recognition,
      color: "var(--chart-1)",
    },
    {
      key: "production",
      label: "Production",
      note: "See the meaning, produce the Spanish",
      from: productionFrom,
      dots: production,
      color: "var(--chart-2)",
    },
  ];
  return (
    <div>
      <div
        role="img"
        aria-label={`Recognition reviews on days ${recognition.join(", ")}. Production starts on day ${productionFrom}, with reviews on days ${production.join(", ")}.`}
        className="flex flex-col gap-5"
      >
        {lanes.map((l) => (
          <div key={l.key} className="flex flex-col gap-2">
            <p className="text-sm">
              <span className="font-bold">{l.label}</span> <span className={muted}>· {l.note}</span>
            </p>
            <div className="relative mx-2 h-4">
              <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-ink-200 dark:bg-ink-700" />
              <div
                className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full"
                style={{ left: at(l.from), right: 0, background: l.color, opacity: 0.35 }}
              />
              {l.dots.map((d) => (
                <span
                  key={d}
                  className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
                  style={{ left: at(d), background: l.color, borderColor: "var(--surface)" }}
                />
              ))}
            </div>
          </div>
        ))}
        <div
          className={`mx-2 flex justify-between text-[11px] tabular-nums ${muted}`}
          aria-hidden="true"
        >
          {[0, 10, 20, 30, 40, 50, 60]
            .filter((d) => d <= days)
            .map((d) => (
              <span key={d}>{d === 0 ? "Day 0" : d}</span>
            ))}
        </div>
      </div>
    </div>
  );
}

const rankLabel = (r: number) => `#${r.toLocaleString("en-US")}`;

/** One learner's level check, question by question, and the estimate settling. */
export function PlacementChart({
  steps,
  height = 260,
}: {
  steps: PlacementStep[];
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>(560);
  const [hover, setHover] = useState<number | null>(null);
  const pad = { left: 52, right: 14, top: 14, bottom: 26 };
  const strip = 26;
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom - strip;
  const [lo, hi] = [Math.log(10), Math.log(10_000)];
  const x = (n: number) => pad.left + ((n - 0.5) / steps.length) * plotW;
  // Common words at the top, rarer words further down.
  const y = (rank: number) => pad.top + ((Math.log(rank) - lo) / (hi - lo)) * plotH;
  const stripY = pad.top + plotH + strip / 2 + 4;
  const est = steps.filter((s) => s.estimateRank !== null && s.estimateRank <= 10_000);
  const line = est
    .map((s, i) => {
      const yy = y(s.estimateRank!).toFixed(1);
      return i === 0 ? `M${x(s.n).toFixed(1)},${yy}` : `H${x(s.n).toFixed(1)}V${yy}`;
    })
    .join("");
  const last = est.at(-1);
  const hs = hover === null ? null : steps[hover]!;
  const describe = (s: PlacementStep) =>
    s.kind === "pseudo"
      ? `A made-up word: ${s.yes ? "said yes" : "said no"}`
      : `Word ${rankLabel(s.rank!)}: ${s.yes ? "knew it" : "didn't"}`;
  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <LegendItem mark={<circle cx="11" cy="6" r="5" style={{ fill: "var(--chart-2)" }} />}>
          Knew it
        </LegendItem>
        <LegendItem
          mark={
            <circle
              cx="11"
              cy="6"
              r="4"
              fill="none"
              strokeWidth="2"
              className="stroke-ink-400 dark:stroke-ink-500"
            />
          }
        >
          Didn&apos;t know it
        </LegendItem>
        <LegendItem
          mark={
            <rect
              x="6"
              y="1"
              width="10"
              height="10"
              rx="2"
              transform="rotate(45 11 6)"
              style={{ fill: "var(--chart-3)" }}
            />
          }
        >
          Made-up word
        </LegendItem>
        <LegendItem
          mark={
            <line
              x1="0"
              x2="22"
              y1="6"
              y2="6"
              strokeWidth="2"
              style={{ stroke: "var(--chart-1)" }}
            />
          }
        >
          Estimate{last ? `, ending near word ${rankLabel(last.estimateRank!)}` : ""}
        </LegendItem>
      </ul>
      <div ref={ref} className="relative w-full min-w-0" onPointerLeave={() => setHover(null)}>
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`A level check of ${steps.length} questions. The estimate settles near word ${last ? rankLabel(last.estimateRank!) : "–"}.`}
          className="block max-w-full"
        >
          {[10, 100, 1_000, 10_000].map((r) => (
            <g key={r}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={y(r)}
                y2={y(r)}
                strokeWidth="1"
                style={{ stroke: "var(--chart-grid)" }}
              />
              <text x={pad.left - 8} y={y(r) + 4} textAnchor="end" className={AXIS_TEXT}>
                {rankLabel(r)}
              </text>
            </g>
          ))}
          <text x={pad.left - 8} y={stripY + 4} textAnchor="end" className={AXIS_TEXT}>
            Made up
          </text>
          {[1, 10, 20, 30, 40]
            .filter((n) => n <= steps.length)
            .map((n) => (
              <text key={n} x={x(n)} y={height - 6} textAnchor="middle" className={AXIS_TEXT}>
                {n === 1 ? "Q1" : n}
              </text>
            ))}
          <path
            d={line}
            fill="none"
            strokeWidth="2"
            strokeLinejoin="round"
            style={{ stroke: "var(--chart-1)" }}
          />
          {steps.map((s, i) => {
            const big = hover === i ? 1.5 : 0;
            if (s.kind === "pseudo") {
              return (
                <rect
                  key={s.n}
                  x={x(s.n) - 5 - big}
                  y={stripY - 5 - big}
                  width={10 + 2 * big}
                  height={10 + 2 * big}
                  rx="2"
                  transform={`rotate(45 ${x(s.n)} ${stripY})`}
                  strokeWidth="2"
                  style={{ fill: "var(--chart-3)", stroke: "var(--surface)" }}
                />
              );
            }
            return s.yes ? (
              <circle
                key={s.n}
                cx={x(s.n)}
                cy={y(s.rank!)}
                r={5 + big}
                strokeWidth="2"
                style={{ fill: "var(--chart-2)", stroke: "var(--surface)" }}
              />
            ) : (
              <circle
                key={s.n}
                cx={x(s.n)}
                cy={y(s.rank!)}
                r={4 + big}
                strokeWidth="2"
                className="stroke-ink-400 dark:stroke-ink-500"
                style={{ fill: "var(--surface)" }}
              />
            );
          })}
          {steps.map((s, i) => (
            <rect
              key={s.n}
              x={x(s.n) - plotW / steps.length / 2}
              y={0}
              width={plotW / steps.length}
              height={height}
              fill="transparent"
              onPointerEnter={() => setHover(i)}
            />
          ))}
        </svg>
        {hs && (
          <Tooltip
            x={Math.min(Math.max(x(hs.n), 100), width - 100)}
            y={hs.kind === "pseudo" ? stripY - 8 : y(hs.rank!) - 6}
            value={describe(hs)}
            label={`Question ${hs.n}${hs.estimateRank && hs.estimateRank <= 10_000 ? ` · estimate ${rankLabel(hs.estimateRank)}` : ""}`}
          />
        )}
      </div>
      <NumbersTable
        caption="Level check, question by question"
        head={["Question", "Answer", "Estimate"]}
        rows={steps.map((s) => [
          s.n,
          describe(s),
          s.estimateRank && s.estimateRank <= 10_000 ? rankLabel(s.estimateRank) : "–",
        ])}
      />
    </div>
  );
}
