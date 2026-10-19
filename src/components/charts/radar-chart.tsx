// Skill radar: one axis per skill, rings at scores 1–5, two series ("now"
// and an earlier date). Plain SVG so it renders on the server and prints.

export type RadarAxis = { id: string; label: string; now: number | null; before: number | null };

// Wider than tall so labels left and right of the web have room.
const WIDTH = 440;
const HEIGHT = 340;
const CX = WIDTH / 2;
const CY = HEIGHT / 2;
const RADIUS = 130;
const MAX = 5;

function point(index: number, count: number, value: number) {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
  const r = (value / MAX) * RADIUS;
  return { x: CX + r * Math.cos(angle), y: CY + r * Math.sin(angle), angle };
}

function polygon(axes: RadarAxis[], key: "now" | "before") {
  return axes.map((a, i) => point(i, axes.length, a[key] ?? 0)).map((p) => `${p.x},${p.y}`).join(" ");
}

export function RadarChart({
  axes,
  labels,
  showBefore,
}: {
  axes: RadarAxis[];
  labels: { now: string; before: string; title: string };
  showBefore: boolean;
}) {
  const count = axes.length;
  const hasBefore = showBefore && axes.some((a) => a.before !== null);

  return (
    <figure className="space-y-2">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={labels.title}
        className="mx-auto block h-auto w-full max-w-md overflow-visible"
      >
        {/* Rings at 1–5 and spokes: hairline, one shade off the surface. */}
        {[1, 2, 3, 4, 5].map((level) => (
          <polygon
            key={level}
            points={axes.map((_, i) => point(i, count, level)).map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            className="stroke-border"
            strokeWidth={1}
          />
        ))}
        {axes.map((a, i) => {
          const end = point(i, count, MAX);
          return <line key={a.id} x1={CX} y1={CY} x2={end.x} y2={end.y} className="stroke-border" strokeWidth={1} />;
        })}

        {hasBefore && (
          <polygon
            points={polygon(axes, "before")}
            fill="none"
            className="stroke-chart-before"
            strokeWidth={2}
            strokeDasharray="5 4"
            strokeLinejoin="round"
          />
        )}
        <polygon
          points={polygon(axes, "now")}
          className="fill-chart-now/15 stroke-chart-now"
          strokeWidth={2}
          strokeLinejoin="round"
        />

        {hasBefore &&
          axes.map((a, i) => {
            if (a.before === null) return null;
            const p = point(i, count, a.before);
            return (
              <circle key={`b-${a.id}`} cx={p.x} cy={p.y} r={4} className="fill-chart-before stroke-surface" strokeWidth={2}>
                <title>{`${a.label} · ${labels.before}: ${a.before}/5`}</title>
              </circle>
            );
          })}
        {axes.map((a, i) => {
          if (a.now === null) return null;
          const p = point(i, count, a.now);
          return (
            <circle key={`n-${a.id}`} cx={p.x} cy={p.y} r={5} className="fill-chart-now stroke-surface" strokeWidth={2}>
              <title>{`${a.label} · ${labels.now}: ${a.now}/5`}</title>
            </circle>
          );
        })}

        {axes.map((a, i) => {
          const p = point(i, count, MAX + 0.5);
          const cos = Math.cos(p.angle);
          const anchor = Math.abs(cos) < 0.2 ? "middle" : cos > 0 ? "start" : "end";
          return (
            <text
              key={`l-${a.id}`}
              x={p.x}
              y={p.y}
              textAnchor={anchor}
              dominantBaseline="middle"
              className="fill-foreground text-[15px]"
            >
              {a.label}
            </text>
          );
        })}
      </svg>
      <figcaption className="flex flex-wrap justify-center gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <svg width="18" height="8" aria-hidden>
            <line x1="0" y1="4" x2="18" y2="4" className="stroke-chart-now" strokeWidth={2} />
          </svg>
          {labels.now}
        </span>
        {hasBefore && (
          <span className="flex items-center gap-1.5">
            <svg width="18" height="8" aria-hidden>
              <line x1="0" y1="4" x2="18" y2="4" className="stroke-chart-before" strokeWidth={2} strokeDasharray="5 4" />
            </svg>
            {labels.before}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
