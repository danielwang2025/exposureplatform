"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { isUuid } from "@/lib/data/children";
import { formValues, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

export async function setPublicAddress(childId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const values = formValues(formData, ["slug"]);
  if (!isUuid(childId)) return { error: "errors.forbidden", values };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_child_slug", {
    p_child_id: childId,
    p_slug: values.slug,
  });
  if (error) {
    if (error.hint === "slug_invalid") return { fieldErrors: { slug: "sharing.errors.slugInvalid" }, values };
    if (error.hint === "slug_taken") return { fieldErrors: { slug: "sharing.errors.slugTaken" }, values };
    return { error: error.code === "42501" ? "errors.forbidden" : "errors.generic", values };
  }

  revalidatePath(`/children/${childId}/settings`);
  return { success: data ? "sharing.addressSaved" : "sharing.addressCleared", values: { slug: data ?? "" } };
}

const linkInput = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("child") }),
  z.object({ scope: z.literal("project"), projectId: z.uuid() }),
  z.object({ scope: z.literal("post"), postId: z.uuid() }),
]);

const expiryDays = { never: null, "7": 7, "30": 30 } as const;

export type CreateLinkInput = z.input<typeof linkInput> & { label?: string; expires?: keyof typeof expiryDays };

export async function createShareLink(
  childId: string,
  input: CreateLinkInput,
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const parsed = linkInput.safeParse(input);
  if (!isUuid(childId) || !parsed.success) return { ok: false, error: "errors.forbidden" };

  const supabase = await createClient();

  // Refuse links that would show nothing, so owners aren't surprised later.
  const { data: child } = await supabase.from("children").select("max_visibility").eq("id", childId).maybeSingle();
  if (!child) return { ok: false, error: "errors.forbidden" };
  if (child.max_visibility === "private" || child.max_visibility === "family") {
    return { ok: false, error: "sharing.errors.profileNotShareable" };
  }
  if (parsed.data.scope !== "child") {
    const target =
      parsed.data.scope === "project"
        ? await supabase.from("projects").select("visibility").eq("id", parsed.data.projectId).eq("child_id", childId).maybeSingle()
        : await supabase.from("posts").select("visibility").eq("id", parsed.data.postId).eq("child_id", childId).maybeSingle();
    if (!target.data) return { ok: false, error: "errors.forbidden" };
    if (target.data.visibility === "private" || target.data.visibility === "family") {
      return {
        ok: false,
        error: parsed.data.scope === "project" ? "sharing.errors.projectNotShareable" : "sharing.errors.postNotShareable",
      };
    }
  }

  const days = expiryDays[input.expires ?? "never"] ?? null;
  const { data, error } = await supabase
    .from("share_links")
    .insert({
      child_id: childId,
      scope: parsed.data.scope,
      project_id: parsed.data.scope === "project" ? parsed.data.projectId : null,
      post_id: parsed.data.scope === "post" ? parsed.data.postId : null,
      label: input.label?.trim().slice(0, 60) || null,
      expires_at: days ? new Date(Date.now() + days * 86_400_000).toISOString() : null,
      created_by: user.id,
    })
    .select("token")
    .single();
  if (error) return { ok: false, error: error.code === "42501" ? "sharing.errors.ownersOnly" : "errors.generic" };

  revalidatePath(`/children/${childId}/settings`);
  return { ok: true, token: data.token };
}

export async function revokeShareLink(childId: string, linkId: string): Promise<{ error?: string }> {
  await requireUser();
  if (!isUuid(childId) || !isUuid(linkId)) return { error: "errors.forbidden" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("share_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", linkId)
    .eq("child_id", childId)
    .select("id");
  if (error || data.length === 0) return { error: "errors.forbidden" };

  revalidatePath(`/children/${childId}/settings`);
  return {};
}
