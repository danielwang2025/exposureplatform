"use server";

import type { PostgrestError } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { isUuid } from "@/lib/data/children";
import { MAX_HIGHLIGHTS } from "@/lib/data/reports";
import { fieldErrorsFrom, formValues, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

function dbErrorKey(error: PostgrestError): string {
  if (error.hint === "visibility_exceeds_max") return "posts.errors.visibilityTooWide";
  if (error.code === "42501") return "errors.forbidden";
  if (error.code === "23514") return "reports.errors.period";
  return "errors.generic";
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "validation.date");

const reportInput = z
  .object({
    title: z.string().trim().min(1, "reports.errors.title").max(80, "reports.errors.title"),
    periodStart: date,
    periodEnd: date,
    visibility: z.enum(["private", "family"]),
    summary: z.string().trim().max(5000, "validation.bodyLength"),
  })
  .refine((v) => v.periodEnd >= v.periodStart, { path: ["periodEnd"], message: "reports.errors.endBeforeStart" })
  .refine(
    (v) => Date.parse(v.periodEnd) - Date.parse(v.periodStart) <= 3 * 366 * 86_400_000,
    { path: ["periodEnd"], message: "reports.errors.tooLong" },
  );

const fields = ["title", "periodStart", "periodEnd", "visibility", "summary"];

function parseReport(formData: FormData) {
  return reportInput.safeParse({
    title: formData.get("title") ?? "",
    periodStart: formData.get("periodStart") ?? "",
    periodEnd: formData.get("periodEnd") ?? "",
    visibility: formData.get("visibility") ?? "family",
    summary: formData.get("summary") ?? "",
  });
}

function toRow(data: z.infer<typeof reportInput>) {
  return {
    title: data.title,
    period_start: data.periodStart,
    period_end: data.periodEnd,
    visibility: data.visibility,
    summary: data.summary,
  };
}

export async function createReport(childId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const values = formValues(formData, fields);
  if (!isUuid(childId)) return { error: "errors.forbidden", values };
  const parsed = parseReport(formData);
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error), values };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reports")
    .insert({ child_id: childId, created_by: user.id, ...toRow(parsed.data) })
    .select("id")
    .single();
  if (error) return { error: dbErrorKey(error), values };

  revalidatePath(`/children/${childId}/reports`);
  // Straight to editing, where photos from the period can be picked.
  redirect(`/children/${childId}/reports/${data.id}/edit?created=1`);
}

export async function updateReport(
  childId: string,
  reportId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireUser();
  const values = formValues(formData, fields);
  if (!isUuid(childId) || !isUuid(reportId)) return { error: "errors.forbidden", values };
  const parsed = parseReport(formData);
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error), values };

  const requested = [...new Set(formData.getAll("highlight").map(String))].filter(isUuid);
  if (requested.length > MAX_HIGHLIGHTS) return { error: "reports.errors.tooManyHighlights", values };

  const supabase = await createClient();
  // Keep only photos of this child that the user can actually see.
  let highlights: string[] = [];
  if (requested.length > 0) {
    const { data: media } = await supabase
      .from("media")
      .select("id")
      .in("id", requested)
      .eq("child_id", childId)
      .eq("kind", "image");
    const allowed = new Set((media ?? []).map((m) => m.id));
    highlights = requested.filter((id) => allowed.has(id));
  }

  const { data, error } = await supabase
    .from("reports")
    .update({ ...toRow(parsed.data), highlight_media_ids: highlights })
    .eq("id", reportId)
    .eq("child_id", childId)
    .select("id");
  if (error) return { error: dbErrorKey(error), values };
  if (data.length === 0) return { error: "errors.forbidden", values };

  revalidatePath(`/children/${childId}/reports`, "layout");
  redirect(`/children/${childId}/reports/${reportId}`);
}

export async function deleteReport(childId: string, reportId: string): Promise<{ ok: false; error: string } | void> {
  await requireUser();
  if (!isUuid(childId) || !isUuid(reportId)) return { ok: false, error: "errors.forbidden" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reports")
    .delete()
    .eq("id", reportId)
    .eq("child_id", childId)
    .select("id");
  if (error || data.length === 0) return { ok: false, error: "errors.forbidden" };

  revalidatePath(`/children/${childId}/reports`);
  redirect(`/children/${childId}/reports`);
}
