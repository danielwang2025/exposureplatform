import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { atLeast, isUuid, type ChildWithRole } from "./children";
import { fetchAllPages } from "./paginate";
import type { PostKind } from "./posts";
import { getSkillHistory, scoreAsOf } from "./skill-history";

export type Report = Database["public"]["Tables"]["reports"]["Row"];
export const MAX_HIGHLIGHTS = 6;
const MAX_PICKER_PHOTOS = 120;

const SIGNED_URL_SECONDS = 60 * 60;

export async function listReports(childId: string): Promise<Report[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .eq("child_id", childId)
    .order("period_end", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export const getReport = cache(async (childId: string, reportId: string): Promise<Report | null> => {
  if (!isUuid(reportId)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .eq("id", reportId)
    .eq("child_id", childId)
    .maybeSingle();
  if (error) throw error;
  return data;
});

export function canEditReport(child: ChildWithRole, report: Report, userId: string) {
  return child.role === "owner" || (atLeast(child.role, "editor") && report.created_by === userId);
}

export type PeriodPhoto = { id: string; thumbUrl: string; fullUrl?: string; postId: string; occurredOn: string };

// Ready photos from posts in the period that the user can see, newest first.
export async function listPeriodPhotos(childId: string, start: string, end: string): Promise<PeriodPhoto[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("media")
    .select("id, storage_path, thumb_path, position, posts!inner ( id, occurred_on, created_at )")
    .eq("child_id", childId)
    .eq("kind", "image")
    .eq("status", "ready")
    .gte("posts.occurred_on", start)
    .lte("posts.occurred_on", end)
    // Newest uploads first, capped; then ordered by the post's date below.
    .order("created_at", { ascending: false })
    .limit(MAX_PICKER_PHOTOS);
  if (error) throw error;
  const sorted = data.sort(
    (a, b) =>
      b.posts.occurred_on.localeCompare(a.posts.occurred_on) ||
      b.posts.created_at.localeCompare(a.posts.created_at) ||
      a.position - b.position,
  );
  return signPhotos(sorted, false);
}

type PhotoRow = {
  id: string;
  storage_path: string | null;
  thumb_path: string | null;
  posts: { id: string; occurred_on: string };
};

// Signed with the user's client, so the storage policy re-checks access.
async function signPhotos(rows: PhotoRow[], withFull: boolean): Promise<PeriodPhoto[]> {
  if (rows.length === 0) return [];
  const supabase = await createClient();
  const paths = rows.flatMap((m) => [m.thumb_path!, ...(withFull ? [m.storage_path!] : [])]);
  const { data } = await supabase.storage.from("media").createSignedUrls(paths, SIGNED_URL_SECONDS);
  const signed = new Map((data ?? []).flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl] as const] : [])));
  return rows.flatMap((m) => {
    const thumbUrl = signed.get(m.thumb_path!);
    if (!thumbUrl) return [];
    return [{
      id: m.id,
      thumbUrl,
      fullUrl: withFull ? signed.get(m.storage_path!) : undefined,
      postId: m.posts.id,
      occurredOn: m.posts.occurred_on,
    }];
  });
}

export type SkillChange = {
  id: string;
  name: string;
  emoji: string | null;
  start: number | null;
  end: number;
  reviewsInPeriod: number;
};

export type ReportContent = {
  counts: { posts: number; moments: number; milestones: number; reviews: number; photos: number; videos: number };
  milestones: { id: string; title: string; occurredOn: string }[];
  projects: { id: string; title: string; emoji: string | null; posts: number }[];
  skills: SkillChange[];
  highlights: PeriodPhoto[];
};

function dayBefore(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Everything in a report is computed from what the reader can see right now
// (RLS), so a viewer's copy never includes guardian-only posts or ratings.
export async function buildReport(report: Report): Promise<ReportContent> {
  const supabase = await createClient();
  const [posts, history, highlights] = await Promise.all([
    // A long period can pass PostgREST's 1000-row cap.
    fetchAllPages((from, to) =>
      supabase
        .from("posts")
        .select("id, kind, title, body, occurred_on, project_id, projects ( id, title, emoji ), media ( kind, status )")
        .eq("child_id", report.child_id)
        .gte("occurred_on", report.period_start)
        .lte("occurred_on", report.period_end)
        .order("occurred_on")
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
    getSkillHistory(report.child_id),
    loadHighlights(report),
  ]);

  const byKind = (kind: PostKind) => posts.filter((p) => p.kind === kind).length;
  const media = posts.flatMap((p) => p.media.filter((m) => m.status === "ready"));

  const projects = new Map<string, ReportContent["projects"][number]>();
  for (const p of posts) {
    if (!p.projects) continue;
    const entry = projects.get(p.projects.id) ?? { ...p.projects, posts: 0 };
    entry.posts += 1;
    projects.set(p.projects.id, entry);
  }

  // Start: the last score before the period, or else the first one in it.
  const skills = history.flatMap(({ skill, points }): SkillChange[] => {
    const inPeriod = points.filter((p) => p.occurredOn >= report.period_start && p.occurredOn <= report.period_end);
    const end = scoreAsOf(points, report.period_end);
    if (end === null || (skill.archived_at && inPeriod.length === 0)) return [];
    const before = scoreAsOf(points, dayBefore(report.period_start));
    return [{
      id: skill.id,
      name: skill.name,
      emoji: skill.emoji,
      start: before ?? inPeriod[0]?.score ?? null,
      end,
      reviewsInPeriod: inPeriod.length,
    }];
  });

  return {
    counts: {
      posts: posts.length,
      moments: byKind("moment"),
      milestones: byKind("milestone"),
      reviews: byKind("review"),
      photos: media.filter((m) => m.kind === "image").length,
      videos: media.filter((m) => m.kind === "video").length,
    },
    milestones: posts
      .filter((p) => p.kind === "milestone")
      .map((p) => ({ id: p.id, title: p.title || p.body.slice(0, 80), occurredOn: p.occurred_on })),
    projects: [...projects.values()].sort((a, b) => b.posts - a.posts),
    skills,
    highlights,
  };
}

// Highlights keep the order the author picked; ones the reader can't see
// (or that were deleted) simply drop out.
async function loadHighlights(report: Report): Promise<PeriodPhoto[]> {
  if (report.highlight_media_ids.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("media")
    .select("id, storage_path, thumb_path, posts!inner ( id, occurred_on )")
    .in("id", report.highlight_media_ids)
    .eq("child_id", report.child_id)
    .eq("kind", "image")
    .eq("status", "ready");
  if (error) throw error;
  const byId = new Map(data.map((m) => [m.id, m]));
  const ordered = report.highlight_media_ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  return signPhotos(ordered, true);
}
