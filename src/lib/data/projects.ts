import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { isUuid } from "./children";

export type Project = Database["public"]["Tables"]["projects"]["Row"];
export type ProjectSummary = Project & {
  postCount: number;
  firstOn: string | null;
  lastOn: string | null;
};

// Counts and dates only include posts the user can see (RLS on the embed).
export async function listProjects(childId: string): Promise<ProjectSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*, posts ( occurred_on )")
    .eq("child_id", childId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  return data
    .map(({ posts, ...project }) => {
      const dates = posts.map((p) => p.occurred_on).sort();
      return { ...project, postCount: dates.length, firstOn: dates[0] ?? null, lastOn: dates.at(-1) ?? null };
    })
    .sort((a, b) => (b.lastOn ?? b.created_at).localeCompare(a.lastOn ?? a.created_at));
}

export const getProject = cache(async (childId: string, projectId: string): Promise<Project | null> => {
  if (!isUuid(projectId)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("child_id", childId)
    .maybeSingle();
  if (error) throw error;
  return data;
});
