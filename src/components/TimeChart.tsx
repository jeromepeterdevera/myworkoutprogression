"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { parseISODate } from "@/lib/workout";

export interface Series {
  name: string;
  color: string;
  values: (number | null)[];
  kind: "line" | "bar" | "dots";
  /** line only: draw straight across missing days */
  connectGaps?: boolean;
  /** hide from the legend and tooltip (e.g. a trend line that has its own entry) */
  quiet?: boolean;
}

/**
 * Small time-series chart: one shared y-axis, thin marks, recessive grid,
 * hover crosshair with a tooltip. Bars with `diverging` colour by sign.
 */
export default function TimeChart({
  dates,
  series,
  format,
  height = 180,
  refLine,
  diverging,
  zeroBased,
}: {
  dates: string[];
  series: Series[];
  format: (v: number) => string;
  height?: number;
  refLine?: { value: number; label: string };
  /** bar colours for [negative, positive] values */
  diverging?: [string, string];
  zeroBased?: boolean;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // the dates change when the range changes: drop a hover index that may no longer exist
  useEffect(() => setHover(null), [dates]);

  const pad = { top: 10, right: 8, bottom: 22, left: 44 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const n = dates.length;
  const step = n ? innerW / n : innerW;
  const xc = (i: number) => pad.left + step * (i + 0.5);

  const { min, max, ticks } = useMemo(() => {
    const all = series.flatMap((s) => s.values.filter((v): v is number => v != null));
    if (refLine) all.push(refLine.value);
    const hasBars = series.some((s) => s.kind === "bar");
    if (zeroBased || hasBars) all.push(0);
    if (!all.length) return { min: 0, max: 1, ticks: [0, 1] };
    return niceScale(Math.min(...all), Math.max(...all));
  }, [series, refLine, zeroBased]);

  const y = (v: number) => pad.top + innerH - ((v - min) / (max - min || 1)) * innerH;
  const bars = series.filter((s) => s.kind === "bar");
  const barW = Math.max(1, Math.min(18, (step - 2) / Math.max(1, bars.length)));

  const hasData = series.some((s) => s.values.some((v) => v != null));
  const legend = series.filter((s) => !s.quiet);

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.floor(((e.clientX - r.left) / r.width) * n);
    setHover(i >= 0 && i < n ? i : null);
  };

  const labelIdx = n === 0 ? [] : n <= 8 ? dates.map((_, i) => i) : [0, Math.floor((n - 1) / 2), n - 1];

  return (
    <div ref={wrap} className="relative w-full">
      {legend.length > 1 && (
        <div className="mb-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600">
          {legend.map((s) => (
            <span key={s.name} className="flex items-center gap-1.5">
              {s.kind === "line" ? (
                <span className="h-0.5 w-4 rounded" style={{ background: s.color }} />
              ) : (
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
              )}
              {s.name}
            </span>
          ))}
        </div>
      )}
      <svg width={width} height={height} className="block select-none" role="img">
        {/* grid + y axis */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke={t === 0 && min < 0 ? "#a1a1aa" : "#e4e4e7"} strokeWidth={1} />
            <text x={pad.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill="#71717a">
              {format(t)}
            </text>
          </g>
        ))}
        {/* x labels */}
        {labelIdx.map((i) => (
          <text key={i} x={xc(i)} y={height - 6} textAnchor={n > 8 ? (i === 0 ? "start" : i === n - 1 ? "end" : "middle") : "middle"} fontSize={10} fill="#71717a">
            {shortDate(dates[i])}
          </text>
        ))}

        {/* reference line */}
        {refLine && (
          <g>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={y(refLine.value)}
              y2={y(refLine.value)}
              stroke="#52525b"
              strokeDasharray="4 3"
              strokeWidth={1}
            />
            <text x={width - pad.right} y={y(refLine.value) - 4} textAnchor="end" fontSize={10} fill="#52525b">
              {refLine.label}
            </text>
          </g>
        )}

        {/* bars: 4px rounded data end, square at the baseline */}
        {bars.map((s, si) =>
          s.values.map((v, i) => {
            if (v == null || v === 0) return null;
            const x = xc(i) - (barW * bars.length) / 2 + si * barW + (bars.length > 1 ? 1 : 0);
            const w = Math.max(1, barW - (bars.length > 1 ? 2 : 0));
            const color = diverging ? (v < 0 ? diverging[0] : diverging[1]) : s.color;
            return <path key={`${s.name}-${i}`} d={barPath(x, w, y(0), y(v))} fill={color} opacity={hover == null || hover === i ? 1 : 0.55} />;
          })
        )}

        {/* lines */}
        {series
          .filter((s) => s.kind === "line")
          .map((s) => (
            <path key={s.name} d={linePath(s.values, xc, y, !!s.connectGaps)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ))}

        {/* dots */}
        {series
          .filter((s) => s.kind === "dots")
          .map((s) =>
            s.values.map((v, i) =>
              v == null ? null : <circle key={`${s.name}-${i}`} cx={xc(i)} cy={y(v)} r={n > 60 ? 2.5 : 4} fill={s.color} stroke="#fff" strokeWidth={1.5} />
            )
          )}

        {/* hover */}
        {hover != null && (
          <g pointerEvents="none">
            <line x1={xc(hover)} x2={xc(hover)} y1={pad.top} y2={pad.top + innerH} stroke="#a1a1aa" strokeWidth={1} />
            {series
              .filter((s) => s.kind === "line" && s.values[hover] != null)
              .map((s) => (
                <circle key={s.name} cx={xc(hover)} cy={y(s.values[hover]!)} r={4} fill={s.color} stroke="#fff" strokeWidth={2} />
              ))}
          </g>
        )}
        <rect
          x={pad.left}
          y={pad.top}
          width={innerW}
          height={innerH}
          fill="transparent"
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
        />
      </svg>

      {!hasData && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-zinc-400">Nothing logged in this period</div>
      )}

      {hover != null && hasData && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs shadow-md"
          style={{
            left: Math.min(Math.max(xc(hover) - 70, 0), width - 140),
            top: legend.length > 1 ? 24 : 0,
            width: 140,
          }}
        >
          <div className="mb-0.5 font-medium text-zinc-800">{longDate(dates[hover])}</div>
          {legend.map((s) => {
            const v = s.values[hover];
            return (
              <div key={s.name} className="flex items-center justify-between gap-2 text-zinc-600">
                <span className="flex items-center gap-1">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: diverging && v != null ? (v < 0 ? diverging[0] : diverging[1]) : s.color }}
                  />
                  {s.name}
                </span>
                <span className="font-medium text-zinc-900">{v == null ? "–" : format(v)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function barPath(x: number, w: number, y0: number, y1: number) {
  const h = Math.abs(y1 - y0);
  const r = Math.min(4, w / 2, h);
  if (y1 < y0) {
    // positive: round the top
    return `M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + w - r} Q${x + w},${y1} ${x + w},${y1 + r} V${y0} Z`;
  }
  // negative: round the bottom
  return `M${x},${y0} V${y1 - r} Q${x},${y1} ${x + r},${y1} H${x + w - r} Q${x + w},${y1} ${x + w},${y1 - r} V${y0} Z`;
}

function linePath(values: (number | null)[], x: (i: number) => number, y: (v: number) => number, connect: boolean) {
  let d = "";
  let pen = false;
  values.forEach((v, i) => {
    if (v == null) {
      if (!connect) pen = false;
      return;
    }
    d += `${pen ? "L" : "M"}${x(i)},${y(v)} `;
    pen = true;
  });
  return d;
}

function niceScale(lo: number, hi: number) {
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const raw = (hi - lo) / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const min = Math.floor(lo / step) * step;
  const max = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let t = min; t <= max + step / 2; t += step) ticks.push(Math.round(t * 1000) / 1000);
  return { min, max, ticks };
}

function shortDate(iso: string) {
  return parseISODate(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function longDate(iso: string) {
  return parseISODate(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}
