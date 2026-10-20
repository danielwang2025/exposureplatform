"use server";

import type { PostgrestError } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { isUuid, visibilities } from "@/lib/data/children";
import { fieldErrorsFrom, formValues, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

function dbErrorKey(error: PostgrestError): string {
  if (error.hint === "visibility_exceeds_max") return "posts.errors.visibilityTooWide";
  if (error.code === "42501") return "errors.forbidden";
  return "errors.generic";
}

const projectInput = z.object({
  title: z.string().trim().min(1, "validation.projectTitle").max(80, "validation.projectTitle"),
  description: z.string().trim().max(1000, "validation.descriptionLength"),
  emoji: z
    .string()
    .trim()
    .max(16)
    .transform((v) => v || null),
  visibility: z.enum(visibilities),
});

function parseProject(formData: FormData) {
  return projectInput.safeParse({
    title: formData.get("title") ?? "",
    description: formData.get("description") ?? "",
    emoji: formData.get("emoji") ?? "",
    visibility: formData.get("visibility") ?? "family",
  });
}

const fields = ["title", "description", "emoji", "visibility"];

export async function createProject(childId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const values = formValues(formData, fields);
  if (!isUuid(childId)) return { error: "errors.forbidden", values };
  const parsed = parseProject(formData);
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error), values };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({ child_id: childId, created_by: user.id, ...parsed.data })
    .select("id")
    .single();
  if (error) return { error: dbErrorKey(error), values };

  revalidatePath(`/children/${childId}/projects`);
  redirect(`/children/${childId}/projects/${data.id}`);
}

export async function updateProject(
  childId: string,
  projectId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireUser();
  const values = formValues(formData, fields);
  if (!isUuid(childId) || !isUuid(projectId)) return { error: "errors.forbidden", values };
  const parsed = parseProject(formData);
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error), values };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .update(parsed.data)
    .eq("id", projectId)
    .eq("child_id", childId)
    .select("id");
  if (error) return { error: dbErrorKey(error), values };
  if (data.length === 0) return { error: "errors.forbidden", values };

  revalidatePath(`/children/${childId}`, "layout");
  redirect(`/children/${childId}/projects/${projectId}`);
}

export async function deleteProject(childId: string, projectId: string): Promise<{ error?: string }> {
  await requireUser();
  if (!isUuid(childId) || !isUuid(projectId)) return { error: "errors.forbidden" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .delete()
    .eq("id", projectId)
    .eq("child_id", childId)
    .select("id");
  if (error) return { error: dbErrorKey(error) };
  if (data.length === 0) return { error: "errors.forbidden" };

  revalidatePath(`/children/${childId}`, "layout");
  redirect(`/children/${childId}/projects`);
}

const skillName = z.string().trim().min(1, "skills.errors.nameLength").max(40, "skills.errors.nameLength");

type SkillResult = { ok: true } | { ok: false; error: string };

function skillErrorKey(error: PostgrestError): string {
  if (error.code === "23505") return "skills.errors.duplicate";
  if (error.hint === "too_many_skills") return "skills.errors.tooMany";
  if (error.code === "42501") return "errors.forbidden";
  return "errors.generic";
}

export async function addSkill(childId: string, projectId: string, name: string): Promise<SkillResult> {
  await requireUser();
  if (!isUuid(childId) || !isUuid(projectId)) return { ok: false, error: "errors.forbidden" };
  const parsed = skillName.safeParse(name);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { count } = await supabase
    .from("skill_dimensions")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);
  const { error } = await supabase
    .from("skill_dimensions")
    .insert({ project_id: projectId, child_id: childId, name: parsed.data, position: count ?? 0 });
  if (error) return { ok: false, error: skillErrorKey(error) };

  revalidatePath(`/children/${childId}`, "layout");
  return { ok: true };
}

export async function renameSkill(childId: string, skillId: string, name: string): Promise<SkillResult> {
  await requireUser();
  if (!isUuid(childId) || !isUuid(skillId)) return { ok: false, error: "errors.forbidden" };
  const parsed = skillName.safeParse(name);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("skill_dimensions")
    .update({ name: parsed.data })
    .eq("id", skillId)
    .eq("child_id", childId)
    .select("id");
  if (error) return { ok: false, error: skillErrorKey(error) };
  if (data.length === 0) return { ok: false, error: "errors.forbidden" };

  revalidatePath(`/children/${childId}`, "layout");
  return { ok: true };
}

export async function deleteSkill(childId: string, skillId: string): Promise<SkillResult> {
  await requireUser();
  if (!isUuid(childId) || !isUuid(skillId)) return { ok: false, error: "errors.forbidden" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("skill_dimensions")
    .delete()
    .eq("id", skillId)
    .eq("child_id", childId)
    .select("id");
  if (error) return { ok: false, error: skillErrorKey(error) };
  if (data.length === 0) return { ok: false, error: "errors.forbidden" };

  revalidatePath(`/children/${childId}`, "layout");
  return { ok: true };
}
