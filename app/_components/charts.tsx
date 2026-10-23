"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { muted } from "./styles";

// Small SVG charts drawn to the container's real width, so text stays at its normal size on
// phones. Marks follow one spec: bars at most 24px wide with a 4px rounded top, 2px lines,
// hairline solid grid, and a value label only where it matters (today, the latest point).
// Every chart has a hover tooltip and a "Show numbers" table, so no value is hover-only.

export type Point = { key: string; label: string; value: number | null; detail?: string };

export function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) =>
      setWidth(Math.max(120, Math.floor(e!.contentRect.width))),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Round axis steps: 1, 2 or 5 times a power of ten. */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw)!;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}

/** Units are suffixes (" min", "%", " words"), so server pages can pass them. */
function fmt(v: number, unit: string): string {
  return `${v.toLocaleString("en-US")}${unit}`;
}

function compact(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K` : String(n);
}

export function Tooltip({
  x,
  y,
  value,
  label,
}: {
  x: number;
  y: number;
  value: string;
  label: string;
}) {
  return (
    <div
      role="presentation"
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border-2 border-ink-200 bg-white px-2.5 py-1.5 text-sm whitespace-nowrap shadow-sm dark:border-ink-700 dark:bg-ink-900"
      style={{ left: x, top: y - 8 }}
    >
      <div className="font-bold">{value}</div>
      <div className={`text-xs ${muted}`}>{label}</div>
    </div>
  );
}

/** The table twin of a chart, folded away under the chart. */
export function NumbersTable({
  caption,
  head,
  rows,
}: {
  caption: string;
  head: string[];
  rows: ReactNode[][];
}) {
  return (
    <details className="mt-2 text-sm">
      <summary className={`inline-flex min-h-11 cursor-pointer items-center ${muted}`}>
        Show numbers
      </summary>
      <table className="mt-1 w-full max-w-sm text-left tabular-nums">
        <caption className="sr-only">{caption}</caption>
        <thead className={muted}>
          <tr>
            {head.map((h, i) => (
              <th key={i} className="py-1 pr-4 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className="py-1 pr-4">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/** A path for a column with a 4px rounded top and a square base. */
function columnPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export const AXIS_TEXT = "fill-ink-500 text-[11px] tabular-nums dark:fill-ink-400";

/**
 * Columns over categories (days, weeks), with an optional goal line. `emphasis` labels one
 * column with its value (today, this week).
 */
export function ColumnChart({
  data,
  unit,
  label,
  goal,
  emphasis,
  height = 180,
  xLabelEvery = 1,
  axis = true,
}: {
  data: Point[];
  unit: string;
  /** What the chart shows, for screen readers and the table caption. */
  label: string;
  goal?: { value: number; label: string };
  emphasis?: string;
  height?: number;
  xLabelEvery?: number;
  /** Without the axis the chart is a compact strip (the home page week). */
  axis?: boolean;
}) {
  const [ref, width] = useWidth<HTMLDivElement>(480);
  const [hover, setHover] = useState<number | null>(null);
  const values = data.map((d) => d.value ?? 0);
  const ticks = niceTicks(Math.max(...values, goal?.value ?? 0, 1), 3);
  const top = ticks.at(-1)!;
  const left = axis ? 36 : 0;
  const pad = { top: 22, bottom: 24 };
  const plotW = width - left;
  const plotH = height - pad.top - pad.bottom;
  const band = plotW / data.length;
  const barW = Math.max(4, Math.min(24, band * 0.62));
  const y = (v: number) => pad.top + plotH - (v / top) * plotH;
  const cx = (i: number) => left + band * i + band / 2;
  return (
    <div>
      <div ref={ref} className="relative w-full min-w-0" onPointerLeave={() => setHover(null)}>
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={label}
          className="block max-w-full"
        >
          {axis &&
            ticks.map((t) => (
              <g key={t}>
                <line
                  x1={left}
                  x2={width}
                  y1={y(t)}
                  y2={y(t)}
                  strokeWidth="1"
                  style={{ stroke: "var(--chart-grid)" }}
                />
                <text x={left - 8} y={y(t) + 4} textAnchor="end" className={AXIS_TEXT}>
                  {compact(t)}
                </text>
              </g>
            ))}
          {!axis && (
            <line
              x1={0}
              x2={width}
              y1={y(0)}
              y2={y(0)}
              strokeWidth="1"
              style={{ stroke: "var(--chart-grid)" }}
            />
          )}
          {data.map((d, i) => {
            const v = d.value ?? 0;
            const h = Math.max(v > 0 ? 2 : 0, y(0) - y(v));
            return (
              <path
                key={d.key}
                d={columnPath(cx(i) - barW / 2, y(0) - h, barW, h)}
                style={{ fill: hover === i ? "var(--chart-1-hover)" : "var(--chart-1)" }}
              />
            );
          })}
          {goal && (
            <g>
              <line
                x1={left}
                x2={width}
                y1={y(goal.value)}
                y2={y(goal.value)}
                strokeWidth="1"
                style={{ stroke: "var(--chart-goal)" }}
              />
              <text
                x={left + 4}
                y={y(goal.value) - 5}
                textAnchor="start"
                className="fill-ink-600 text-[11px] font-semibold dark:fill-ink-300"
              >
                {goal.label}
              </text>
            </g>
          )}
          {data.map((d, i) =>
            d.key === emphasis && d.value ? (
              <text
                key={d.key}
                // Kept inside the chart: about 7px per character at this size.
                x={Math.min(cx(i), width - (fmt(d.value, unit).length * 7) / 2)}
                y={y(d.value) - 6}
                textAnchor="middle"
                className="fill-current text-xs font-bold"
              >
                {fmt(d.value, unit)}
              </text>
            ) : null,
          )}
          {data.map((d, i) =>
            i % xLabelEvery === 0 || d.key === emphasis ? (
              <text
                key={d.key}
                x={cx(i)}
                y={height - 6}
                textAnchor="middle"
                className={`${AXIS_TEXT} ${d.key === emphasis ? "font-bold" : ""}`}
              >
                {d.label}
              </text>
            ) : null,
          )}
          {data.map((d, i) => (
            <rect
              key={d.key}
              x={left + band * i}
              y={0}
              width={band}
              height={height}
              fill="transparent"
              onPointerEnter={() => setHover(i)}
            />
          ))}
        </svg>
        {hover !== null && (
          <Tooltip
            x={cx(hover)}
            y={y(data[hover]!.value ?? 0)}
            value={data[hover]!.value === null ? "–" : fmt(data[hover]!.value!, unit)}
            label={data[hover]!.detail ?? data[hover]!.label}
          />
        )}
      </div>
      <NumbersTable
        caption={label}
        head={["", "Value"]}
        rows={data.map((d) => [d.detail ?? d.label, d.value === null ? "–" : fmt(d.value, unit)])}
      />
    </div>
  );
}

/**
 * A line over time with a light wash beneath, a crosshair tooltip, and the latest value
 * labeled at the end.
 */
export function LineChart({
  data,
  unit,
  label,
  height = 200,
  domain,
}: {
  data: Point[];
  unit: string;
  label: string;
  height?: number;
  /** Fixed y range, such as 0–100 for percentages. Otherwise it fits the data. */
  domain?: [number, number];
}) {
  const [ref, width] = useWidth<HTMLDivElement>(480);
  const [hover, setHover] = useState<number | null>(null);
  const known = data.flatMap((d, i) => (d.value === null ? [] : [{ i, v: d.value }]));
  if (known.length < 2) {
    return <p className={muted}>The chart appears after a few more sessions.</p>;
  }
  const vals = known.map((k) => k.v);
  let lo = domain?.[0] ?? 0;
  let ticks: number[];
  if (domain) {
    ticks = niceTicks(domain[1] - domain[0], 4).map((t) => t + domain[0]);
  } else {
    // A baseline at zero flattens slow growth into a line; start near the data instead.
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = niceTicks(Math.max(1, max - min), 3);
    const step = span[1]! - span[0]!;
    lo = min < max / 2 ? 0 : Math.floor(min / step) * step;
    ticks = niceTicks(Math.max(1, max - lo), 3).map((t) => t + lo);
  }
  const hi = ticks.at(-1)!;
  const left = 40;
  // Room for the latest value's label at the end of the line.
  const right = 16 + 7 * fmt(Math.max(...vals), unit).length;
  const pad = { top: 16, bottom: 24 };
  const plotW = width - left - right;
  const plotH = height - pad.top - pad.bottom;
  const x = (i: number) => left + (data.length === 1 ? 0 : (i / (data.length - 1)) * plotW);
  const y = (v: number) => pad.top + plotH - ((v - lo) / (hi - lo)) * plotH;
  const line = known.map((k, j) => `${j ? "L" : "M"}${x(k.i).toFixed(1)},${y(k.v).toFixed(1)}`);
  const area = `${line.join("")}L${x(known.at(-1)!.i)},${y(lo)}L${x(known[0]!.i)},${y(lo)}Z`;
  const last = known.at(-1)!;
  const nearest = (px: number) =>
    known.reduce((best, k) => (Math.abs(x(k.i) - px) < Math.abs(x(best.i) - px) ? k : best)).i;
  const xLabels = [0, Math.floor((data.length - 1) / 2), data.length - 1];
  const h = hover === null ? null : data[hover]!;
  return (
    <div>
      <div
        ref={ref}
        className="relative w-full min-w-0 touch-pan-y"
        onPointerMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          setHover(nearest(e.clientX - box.left));
        }}
        onPointerLeave={() => setHover(null)}
      >
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={label}
          className="block max-w-full"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={left}
                x2={width - right + 8}
                y1={y(t)}
                y2={y(t)}
                strokeWidth="1"
                style={{ stroke: "var(--chart-grid)" }}
              />
              <text x={left - 8} y={y(t) + 4} textAnchor="end" className={AXIS_TEXT}>
                {compact(t)}
              </text>
            </g>
          ))}
          <path d={area} style={{ fill: "var(--chart-wash)" }} />
          <path
            d={line.join("")}
            fill="none"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            style={{ stroke: "var(--chart-1)" }}
          />
          {hover !== null && h?.value != null && (
            <>
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={pad.top}
                y2={y(lo)}
                strokeWidth="1"
                style={{ stroke: "var(--chart-goal)" }}
              />
              <circle
                cx={x(hover)}
                cy={y(h.value)}
                r="5"
                strokeWidth="2"
                style={{ fill: "var(--chart-1)", stroke: "var(--surface)" }}
              />
            </>
          )}
          <circle
            cx={x(last.i)}
            cy={y(last.v)}
            r="5"
            strokeWidth="2"
            style={{ fill: "var(--chart-1)", stroke: "var(--surface)" }}
          />
          <text x={x(last.i) + 10} y={y(last.v) + 4} className="fill-current text-xs font-bold">
            {fmt(last.v, unit)}
          </text>
          {[...new Set(xLabels)].map((i) => (
            <text
              key={i}
              x={x(i)}
              y={height - 6}
              textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}
              className={AXIS_TEXT}
            >
              {data[i]!.label}
            </text>
          ))}
        </svg>
        {hover !== null && h?.value != null && (
          <Tooltip
            x={x(hover)}
            y={y(h.value)}
            value={fmt(h.value, unit)}
            label={h.detail ?? h.label}
          />
        )}
      </div>
      <NumbersTable
        caption={label}
        head={["", "Value"]}
        rows={data.map((d) => [d.detail ?? d.label, d.value === null ? "–" : fmt(d.value, unit)])}
      />
    </div>
  );
}

/** A tiny trend line for a stat tile. Decorative: the tile states the number. */
export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 96;
  const h = 32;
  const lo = Math.min(...values);
  const hi = Math.max(...values, lo + 1);
  const x = (i: number) => 4 + (i / (values.length - 1)) * (w - 8);
  const y = (v: number) => h - 4 - ((v - lo) / (hi - lo)) * (h - 8);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  return (
    <svg width={w} height={h} aria-hidden="true" className="block shrink-0">
      <path
        d={d.join("")}
        fill="none"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        style={{ stroke: "var(--chart-1)" }}
      />
      <circle
        cx={x(values.length - 1)}
        cy={y(values.at(-1)!)}
        r="4"
        strokeWidth="2"
        style={{ fill: "var(--chart-1)", stroke: "var(--surface)" }}
      />
    </svg>
  );
}

export type Segment = { key: string; label: string; value: number; color: string };

/** One bar split into parts, with a legend that carries the counts. */
export function StackedBar({ segments, label }: { segments: Segment[]; label: string }) {
  const total = segments.reduce((n, s) => n + s.value, 0);
  return (
    <div>
      <div
        role="img"
        aria-label={`${label}: ${segments.map((s) => `${s.value} ${s.label.toLowerCase()}`).join(", ")}`}
        className="flex h-4 w-full gap-[2px] overflow-hidden rounded-[4px] bg-ink-100 dark:bg-ink-800"
      >
        {total > 0 &&
          segments
            .filter((s) => s.value > 0)
            .map((s) => (
              <div
                key={s.key}
                title={`${s.label}: ${s.value}`}
                style={{ width: `${(100 * s.value) / total}%`, background: s.color }}
              />
            ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-3 w-3 rounded-[3px]"
              style={{ background: s.color }}
            />
            <span className="font-bold tabular-nums">{s.value}</span>
            <span className={muted}>{s.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A labeled horizontal bar per row, value at the tip. For ranked lists. */
export function BarList({
  items,
}: {
  items: { key: string; label: ReactNode; value: number; max: number; valueLabel: string }[];
}) {
  return (
    <ul className="flex flex-col gap-3">
      {items.map((it) => (
        <li key={it.key} className="grid grid-cols-[minmax(0,10rem)_1fr] items-center gap-3">
          <span className="truncate">{it.label}</span>
          <span className="flex items-center gap-2">
            <span
              className="h-3 rounded-r-[4px]"
              style={{
                width: `${Math.max(2, (100 * it.value) / Math.max(1, it.max)) * 0.8}%`,
                background: "var(--chart-1)",
              }}
            />
            <span className="text-sm font-semibold whitespace-nowrap tabular-nums">
              {it.valueLabel}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** A labeled panel for one chart or figure. */
export function ChartCard({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card flex min-w-0 flex-col gap-4 p-5 ${className}`}>
      <div>
        <h2 className="text-lg font-bold">{title}</h2>
        {subtitle && <p className={`text-sm ${muted}`}>{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

/** A big number with a label, and optionally a trend or a note under it. */
export function StatTile({
  label,
  value,
  note,
  trend,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  trend?: number[];
}) {
  return (
    <div className="card flex flex-col gap-1 p-4">
      <dt className={`text-sm font-semibold ${muted}`}>{label}</dt>
      <dd className="flex items-end justify-between gap-3">
        <span className="text-3xl font-extrabold tracking-tight">{value}</span>
        {trend && <Sparkline values={trend} />}
      </dd>
      {note && <dd className={`text-sm ${muted}`}>{note}</dd>}
    </div>
  );
}

export type Dot = { key: string; value: number; color: string; title: string };

/**
 * One dot per item along a single axis (each student's minutes), stacked where they would
 * overlap, with an optional goal line. Colors and their legend come from the caller.
 */
export function DotStrip({
  dots,
  unit,
  label,
  goal,
}: {
  dots: Dot[];
  unit: string;
  label: string;
  goal?: { value: number; label: string };
}) {
  const [ref, width] = useWidth<HTMLDivElement>(480);
  const [hover, setHover] = useState<number | null>(null);
  const r = 6;
  const step = 2 * r + 3;
  const pad = { left: 8, right: 8, bottom: 24, top: 22 };
  const ticks = niceTicks(Math.max(1, ...dots.map((d) => d.value), (goal?.value ?? 0) * 1.2), 4);
  const top = ticks.at(-1)!;
  const plotW = width - pad.left - pad.right;
  const x = (v: number) => pad.left + (v / top) * plotW;
  // Stack dots that share a pixel bin, lowest values first.
  const order = dots.map((d, i) => ({ d, i })).sort((a, b) => a.d.value - b.d.value);
  const heights = new Map<number, number>();
  const placed = new Map<number, { cx: number; level: number }>();
  for (const { d, i } of order) {
    const bin = Math.round(x(d.value) / step);
    const level = heights.get(bin) ?? 0;
    heights.set(bin, level + 1);
    placed.set(i, { cx: bin * step, level });
  }
  const levels = Math.max(1, ...heights.values());
  const height = pad.top + levels * step + pad.bottom;
  const base = height - pad.bottom - r - 2;
  const cy = (level: number) => base - level * step;
  const hd = hover === null ? null : dots[hover]!;
  return (
    <div>
      <div ref={ref} className="relative w-full min-w-0" onPointerLeave={() => setHover(null)}>
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={label}
          className="block max-w-full"
        >
          <line
            x1={pad.left}
            x2={width - pad.right}
            y1={height - pad.bottom}
            y2={height - pad.bottom}
            strokeWidth="1"
            style={{ stroke: "var(--chart-grid)" }}
          />
          {ticks.map((t) => (
            <text
              key={t}
              x={x(t)}
              y={height - 6}
              textAnchor={t === 0 ? "start" : t === top ? "end" : "middle"}
              className={AXIS_TEXT}
            >
              {fmt(t, unit)}
            </text>
          ))}
          {goal && (
            <g>
              <line
                x1={x(goal.value)}
                x2={x(goal.value)}
                y1={pad.top - 6}
                y2={height - pad.bottom}
                strokeWidth="1"
                style={{ stroke: "var(--chart-goal)" }}
              />
              <text
                x={x(goal.value) + 4}
                y={pad.top - 8}
                className="fill-ink-600 text-[11px] font-semibold dark:fill-ink-300"
              >
                {goal.label}
              </text>
            </g>
          )}
          {dots.map((d, i) => {
            const p = placed.get(i)!;
            return (
              <g key={d.key} onPointerEnter={() => setHover(i)}>
                <circle cx={p.cx} cy={cy(p.level)} r={12} fill="transparent" />
                <circle
                  cx={p.cx}
                  cy={cy(p.level)}
                  r={hover === i ? r + 1.5 : r}
                  strokeWidth="2"
                  style={{ fill: d.color, stroke: "var(--surface)" }}
                />
              </g>
            );
          })}
        </svg>
        {hd && (
          <Tooltip
            x={placed.get(hover!)!.cx}
            y={cy(placed.get(hover!)!.level) - r}
            value={fmt(hd.value, unit)}
            label={hd.title}
          />
        )}
      </div>
      <NumbersTable
        caption={label}
        head={["", "Value"]}
        rows={dots.map((d) => [d.title, fmt(d.value, unit)])}
      />
    </div>
  );
}
