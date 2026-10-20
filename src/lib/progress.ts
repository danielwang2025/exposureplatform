import type { TimelinePost } from "@/lib/data/posts";

export type SkillProgress = {
  id: string;
  name: string;
  first: { score: number; date: string };
  latest: { score: number; date: string };
  count: number;
};

export type Assessment = { postId: string; date: string; scores: Record<string, number> };

export type ProjectProgress = {
  skills: SkillProgress[];
  // One row per scored post, oldest first — the table view of the chart.
  assessments: Assessment[];
  skillNames: { id: string; name: string }[];
};

// First vs latest score per skill, from whatever posts the viewer can see.
export function computeProgress(posts: TimelinePost[]): ProjectProgress | null {
  const scored = posts
    .filter((p) => p.scores.length > 0)
    .sort((a, b) => a.occurredOn.localeCompare(b.occurredOn) || a.createdAt.localeCompare(b.createdAt));
  if (scored.length === 0) return null;

  const skills = new Map<string, SkillProgress & { position: number }>();
  for (const post of scored) {
    for (const s of post.scores) {
      const point = { score: s.score, date: post.occurredOn };
      const existing = skills.get(s.dimensionId);
      if (existing) {
        existing.latest = point;
        existing.count += 1;
      } else {
        skills.set(s.dimensionId, { id: s.dimensionId, name: s.name, position: s.position, first: point, latest: point, count: 1 });
      }
    }
  }

  const ordered = [...skills.values()].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  return {
    skills: ordered.map(({ id, name, first, latest, count }) => ({ id, name, first, latest, count })),
    skillNames: ordered.map(({ id, name }) => ({ id, name })),
    assessments: scored.map((p) => ({
      postId: p.id,
      date: p.occurredOn,
      scores: Object.fromEntries(p.scores.map((s) => [s.dimensionId, s.score])),
    })),
  };
}
