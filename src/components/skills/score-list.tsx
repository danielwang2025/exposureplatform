import type { PostScore } from "@/lib/data/posts";

// Compact read-only scores on a post card: name, five pips, value.
export function ScoreList({ scores, label }: { scores: PostScore[]; label: string }) {
  if (scores.length === 0) return null;
  return (
    <dl aria-label={label} className="grid gap-x-6 gap-y-1.5 rounded-xl bg-background px-3 py-2.5 sm:grid-cols-2">
      {scores.map((s) => (
        <div key={s.dimensionId} className="flex items-center gap-2 text-sm">
          <dt className="min-w-0 flex-1 truncate text-muted">{s.name}</dt>
          <dd className="flex items-center gap-1.5">
            <span aria-hidden className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <span key={n} className={`h-2 w-3 rounded-sm ${n <= s.score ? "bg-viz-latest" : "bg-viz-grid"}`} />
              ))}
            </span>
            <span className="w-3 text-right font-medium tabular-nums">{s.score}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
