"use server";

import type { PostgrestError } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { isUuid } from "@/lib/data/children";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

function dbErrorKey(error: PostgrestError): string {
  if (error.hint === "too_many_skills") return "skills.errors.tooMany";
  if (error.code === "23505") return "skills.errors.duplicate";
  if (error.code === "42501") return "errors.forbidden";
  return "errors.generic";
}

const skillInput = z.object({
  name: z.string().trim().min(1, "skills.errors.name").max(40, "skills.errors.name"),
  emoji: z
    .string()
    .trim()
    .max(16)
    .transform((v) => v || null),
});

function revalidateChild(childId: string) {
  revalidatePath(`/children/${childId}`, "layout");
}

export async function addSkills(childId: string, skills: { name: string; emoji: string }[]): Promise<Result> {
  const user = await requireUser();
  if (!isUuid(childId) || skills.length === 0 || skills.length > 12) return { ok: false, error: "errors.forbidden" };
  const parsed = z.array(skillInput).safeParse(skills);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { count } = await supabase
    .from("skills")
    .select("id", { count: "exact", head: true })
    .eq("child_id", childId);
  const { error } = await supabase.from("skills").insert(
    parsed.data.map((s, i) => ({ ...s, child_id: childId, created_by: user.id, position: (count ?? 0) + i })),
  );
  if (error) return { ok: false, error: dbErrorKey(error) };

  revalidateChild(childId);
  return { ok: true };
}

export async function updateSkill(
  childId: string,
  skillId: string,
  input: { name: string; emoji: string },
): Promise<Result> {
  await requireUser();
  if (!isUuid(childId) || !isUuid(skillId)) return { ok: false, error: "errors.forbidden" };
  const parsed = skillInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("skills")
    .update(parsed.data)
    .eq("id", skillId)
    .eq("child_id", childId)
    .select("id");
  if (error) return { ok: false, error: dbErrorKey(error) };
  if (data.length === 0) return { ok: false, error: "errors.forbidden" };

  revalidateChild(childId);
  return { ok: true };
}

export async function setSkillArchived(childId: string, skillId: string, archived: boolean): Promise<Result> {
  await requireUser();
  if (!isUuid(childId) || !isUuid(skillId)) return { ok: false, error: "errors.forbidden" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("skills")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", skillId)
    .eq("child_id", childId)
    .select("id");
  if (error) return { ok: false, error: dbErrorKey(error) };
  if (data.length === 0) return { ok: false, error: "errors.forbidden" };

  revalidateChild(childId);
  return { ok: true };
}

export async function deleteSkill(childId: string, skillId: string): Promise<Result> {
  await requireUser();
  if (!isUuid(childId) || !isUuid(skillId)) return { ok: false, error: "errors.forbidden" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("skills")
    .delete()
    .eq("id", skillId)
    .eq("child_id", childId)
    .select("id");
  if (error || data.length === 0) return { ok: false, error: "errors.forbidden" };

  revalidateChild(childId);
  return { ok: true };
}
