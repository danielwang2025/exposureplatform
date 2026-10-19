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
