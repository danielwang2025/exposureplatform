import Link from "next/link";

// One skill's scores over time: a 1–5 line with a marker per review. All
// skills share the same x range so small multiples line up.

export type TrendPoint = { date: string; score: number; href?: string; label: string };

const W = 320;
const H = 112;
const PAD = { top: 10, right: 12, bottom: 22, left: 22 };
// Keeps end markers clear of the y-axis labels and the right edge.
const INSET = 8;

function dayNumber(date: string) {
  return Date.parse(`${date}T00:00:00Z`) / 86_400_000;
}

export function TrendChart({
  points,
  domain,
  formatDate,
  title,
}: {
  points: TrendPoint[];
  domain: { from: string; to: string };
  formatDate: (date: string) => string;
  title: string;
}) {
  const x0 = dayNumber(domain.from);
  const span = Math.max(dayNumber(domain.to) - x0, 1);
  const plotW = W - PAD.left - PAD.right - 2 * INSET;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (date: string) =>
    points.length === 1 && domain.from === domain.to
      ? PAD.left + INSET + plotW / 2
      : PAD.left + INSET + ((dayNumber(date) - x0) / span) * plotW;
  const y = (score: number) => PAD.top + ((5 - score) / 4) * plotH;
  const last = points.at(-1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} className="block h-auto w-full overflow-visible">
      {[1, 3, 5].map((level) => (
        <g key={level}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(level)} y2={y(level)} className="stroke-border" strokeWidth={1} />
          <text x={PAD.left - 6} y={y(level)} textAnchor="end" dominantBaseline="middle" className="fill-muted text-[10px]">
            {level}
          </text>
        </g>
      ))}
      <text x={PAD.left} y={H - 4} className="fill-muted text-[10px]">
        {formatDate(domain.from)}
      </text>
      {domain.to !== domain.from && (
        <text x={W - PAD.right} y={H - 4} textAnchor="end" className="fill-muted text-[10px]">
          {formatDate(domain.to)}
        </text>
      )}

      {points.length > 1 && (
        <polyline
          points={points.map((p) => `${x(p.date)},${y(p.score)}`).join(" ")}
          fill="none"
          className="stroke-chart-now"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {points.map((p, i) => {
        const marker = (
          <g className="group">
            {/* Larger invisible hit target than the mark itself. */}
            <circle cx={x(p.date)} cy={y(p.score)} r={10} fill="transparent" />
            <circle
              cx={x(p.date)}
              cy={y(p.score)}
              r={4}
              className="fill-chart-now stroke-surface transition-[r] group-hover:[r:6]"
              strokeWidth={2}
            />
            <title>{p.label}</title>
          </g>
        );
        return p.href ? (
          <Link key={i} href={p.href} aria-label={p.label}>
            {marker}
          </Link>
        ) : (
          <g key={i}>{marker}</g>
        );
      })}
      {last && (
        <text
          x={x(last.date)}
          y={y(last.score) - 9}
          textAnchor={x(last.date) > W - 40 ? "end" : "middle"}
          className="fill-foreground text-[11px] font-medium"
        >
          {last.score}
        </text>
      )}
    </svg>
  );
}
