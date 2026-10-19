"use server";

import type { PostgrestError } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { isUuid, memberRoles, visibilities } from "@/lib/data/children";
import { invitationEmail, sendEmail } from "@/lib/email";
import { checkbox, email, fieldErrorsFrom, formValues, type FormState } from "@/lib/forms";
import { siteOrigin } from "@/lib/site";
import { purgeMediaFiles } from "@/lib/media-cleanup";
import { createClient } from "@/lib/supabase/server";

function dbErrorKey(error: PostgrestError): string {
  if (error.hint === "last_owner") return "errors.lastOwner";
  if (error.code === "42501") return "errors.forbidden";
  return "errors.generic";
}

const childDetails = z.object({
  nickname: z.string().trim().min(1, "validation.nicknameLength").max(40, "validation.nicknameLength"),
  birthDate: z
    .string()
    .trim()
    .transform((value) => value || null)
    .refine(
      (value) => value === null || (/^\d{4}-\d{2}-\d{2}$/.test(value) && value <= new Date().toISOString().slice(0, 10)),
      "validation.birthDate",
    ),
  maxVisibility: z.enum(visibilities),
});

function parseChildDetails(formData: FormData) {
  return childDetails.safeParse({
    nickname: formData.get("nickname") ?? "",
    birthDate: formData.get("birthDate") ?? "",
    maxVisibility: formData.get("maxVisibility") ?? "family",
  });
}

export async function createChild(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const values = formValues(formData, ["nickname", "birthDate", "maxVisibility"]);
  const parsed = parseChildDetails(formData);
  const consent = checkbox.safeParse(formData.get("consent"));
  if (!parsed.success || !consent.success) {
    return {
      fieldErrors: {
        ...(parsed.success ? {} : fieldErrorsFrom(parsed.error)),
        ...(consent.success ? {} : { consent: "validation.mustAgree" }),
      },
      values,
    };
  }

  const supabase = await createClient();
  const { data: childId, error } = await supabase.rpc("create_child", {
    p_nickname: parsed.data.nickname,
    p_birth_date: parsed.data.birthDate ?? undefined,
    p_max_visibility: parsed.data.maxVisibility,
  });
  if (error) return { error: dbErrorKey(error), values };

  revalidatePath("/dashboard");
  redirect(`/children/${childId}`);
}

export async function updateChild(childId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const values = formValues(formData, ["nickname", "birthDate", "maxVisibility"]);
  const parsed = parseChildDetails(formData);
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error), values };
  if (!isUuid(childId)) return { error: "errors.forbidden", values };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("children")
    .update({
      nickname: parsed.data.nickname,
      birth_date: parsed.data.birthDate,
      max_visibility: parsed.data.maxVisibility,
    })
    .eq("id", childId)
    .select("id");
  if (error) return { error: dbErrorKey(error), values };
  if (data.length === 0) return { error: "errors.forbidden", values };

  revalidatePath(`/children/${childId}`, "layout");
  revalidatePath("/dashboard");
  return { success: "child.saved", values };
}

export async function deleteChild(childId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  if (!isUuid(childId)) return { error: "errors.forbidden" };

  const supabase = await createClient();
  const { data: child } = await supabase.from("children").select("nickname").eq("id", childId).maybeSingle();
  if (!child) return { error: "errors.forbidden" };
  if (String(formData.get("confirm") ?? "").trim() !== child.nickname) {
    return { fieldErrors: { confirm: "validation.confirmNickname" } };
  }

  // Collect the files first: the rows disappear with the cascade.
  const { data: media } = await supabase
    .from("media")
    .select("storage_path, thumb_path, mux_asset_id, mux_upload_id")
    .eq("child_id", childId);
  const { data, error } = await supabase.from("children").delete().eq("id", childId).select("id");
  if (error) return { error: dbErrorKey(error) };
  if (data.length === 0) return { error: "errors.forbidden" };

  await purgeMediaFiles(media ?? []);
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

const inviteSchema = z.object({
  email,
  role: z.enum(["viewer", "teacher", "editor"]),
});

export async function inviteMember(childId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const values = formValues(formData, ["email", "role"]);
  const parsed = inviteSchema.safeParse({ email: formData.get("email"), role: formData.get("role") });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error), values };
  if (!isUuid(childId)) return { error: "errors.forbidden", values };

  const supabase = await createClient();
  const { data: invitation, error } = await supabase
    .from("invitations")
    .insert({
      child_id: childId,
      email: parsed.data.email,
      role: parsed.data.role,
      invited_by: user.id,
    })
    .select("token, children ( nickname ), profiles!invitations_invited_by_fkey ( display_name )")
    .single();
  if (error) return { error: dbErrorKey(error), values };

  // The link is always shown to copy as well, in case the email goes astray.
  const sent = await sendEmail({
    to: parsed.data.email,
    ...invitationEmail({
      inviter: invitation.profiles?.display_name ?? "",
      nickname: invitation.children?.nickname ?? "",
      role: parsed.data.role,
      url: `${await siteOrigin()}/invite/${invitation.token}`,
    }),
  });

  revalidatePath(`/children/${childId}/settings`);
  return {
    success: sent ? "members.inviteSent" : "members.inviteCreated",
    values: { invitedEmail: parsed.data.email },
  };
}

export async function revokeInvitation(childId: string, invitationId: string) {
  await requireUser();
  if (!isUuid(childId) || !isUuid(invitationId)) return { error: "errors.forbidden" };

  const supabase = await createClient();
  const { error } = await supabase.from("invitations").delete().eq("id", invitationId).eq("child_id", childId);
  if (error) return { error: dbErrorKey(error) };

  revalidatePath(`/children/${childId}/settings`);
  return {};
}

export async function changeMemberRole(childId: string, userId: string, role: string) {
  await requireUser();
  const parsedRole = z.enum(memberRoles).safeParse(role);
  if (!isUuid(childId) || !isUuid(userId) || !parsedRole.success) return { error: "errors.forbidden" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("child_members")
    .update({ role: parsedRole.data })
    .eq("child_id", childId)
    .eq("user_id", userId)
    .select("user_id");
  if (error) return { error: dbErrorKey(error) };
  if (data.length === 0) return { error: "errors.forbidden" };

  revalidatePath(`/children/${childId}`, "layout");
  return {};
}

export async function removeMember(childId: string, userId: string) {
  const user = await requireUser();
  if (!isUuid(childId) || !isUuid(userId)) return { error: "errors.forbidden" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("child_members")
    .delete()
    .eq("child_id", childId)
    .eq("user_id", userId)
    .select("user_id");
  if (error) return { error: dbErrorKey(error) };
  if (data.length === 0) return { error: "errors.forbidden" };

  if (userId === user.id) {
    revalidatePath("/dashboard");
    redirect("/dashboard");
  }
  revalidatePath(`/children/${childId}/settings`);
  return {};
}

export async function acceptInvitation(token: string): Promise<{ error?: string }> {
  await requireUser();
  const supabase = await createClient();
  const { data: childId, error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error) {
    const known = ["not_found", "expired", "accepted", "email_mismatch"];
    return { error: error.hint && known.includes(error.hint) ? `invite.errors.${error.hint}` : "errors.generic" };
  }

  revalidatePath("/dashboard");
  redirect(`/children/${childId}`);
}
