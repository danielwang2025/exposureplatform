import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type Skill = Database["public"]["Tables"]["skills"]["Row"];

export const MAX_ACTIVE_SKILLS = 12;

// Active skills first (in their set order), then archived ones.
export async function listSkills(childId: string): Promise<Skill[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("skills")
    .select("*")
    .eq("child_id", childId)
    .order("position")
    .order("created_at");
  if (error) throw error;
  return [...data.filter((s) => !s.archived_at), ...data.filter((s) => s.archived_at)];
}
