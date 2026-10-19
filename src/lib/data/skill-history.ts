import "server-only";
import { createClient } from "@/lib/supabase/server";
import { fetchAllPages } from "./paginate";
import { listSkills, type Skill } from "./skills";

export type SkillPoint = { postId: string; occurredOn: string; createdAt: string; score: number; title: string | null };
export type SkillSeries = { skill: Skill; points: SkillPoint[] };

// Every rating the user can see (RLS on posts decides), grouped by skill,
// oldest first. Skills with no visible ratings come back with no points.
export async function getSkillHistory(childId: string): Promise<SkillSeries[]> {
  const supabase = await createClient();
  const [skills, data] = await Promise.all([
    listSkills(childId),
    // Years of reviews can pass PostgREST's 1000-row cap.
    fetchAllPages((from, to) =>
      supabase
        .from("skill_ratings")
        .select("skill_id, score, post_id, posts!inner ( occurred_on, created_at, title )")
        .eq("child_id", childId)
        .order("post_id")
        .order("skill_id")
        .range(from, to),
    ),
  ]);

  const bySkill = new Map<string, SkillPoint[]>();
  for (const row of data) {
    const points = bySkill.get(row.skill_id) ?? [];
    points.push({
      postId: row.post_id,
      occurredOn: row.posts.occurred_on,
      createdAt: row.posts.created_at,
      score: row.score,
      title: row.posts.title,
    });
    bySkill.set(row.skill_id, points);
  }
  return skills.map((skill) => ({
    skill,
    points: (bySkill.get(skill.id) ?? []).sort(
      (a, b) => a.occurredOn.localeCompare(b.occurredOn) || a.createdAt.localeCompare(b.createdAt),
    ),
  }));
}

// The latest score on or before a date (YYYY-MM-DD); points are oldest first.
export function scoreAsOf(points: SkillPoint[], date: string): number | null {
  let score: number | null = null;
  for (const p of points) {
    if (p.occurredOn > date) break;
    score = p.score;
  }
  return score;
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function monthsBefore(date: string, months: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  return isoDate(d);
}
