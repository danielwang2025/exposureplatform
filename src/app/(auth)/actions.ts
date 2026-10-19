"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { safeNextPath } from "@/lib/auth";
import { checkbox, email, fieldErrorsFrom, formValues, password, type FormState } from "@/lib/forms";
import { siteOrigin } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";


function authErrorKey(code: string | undefined): string {
  switch (code) {
    case "invalid_credentials":
      return "auth.errors.invalidCredentials";
    case "email_not_confirmed":
      return "auth.errors.emailNotConfirmed";
    case "user_already_exists":
    case "email_exists":
      return "auth.errors.userExists";
    case "weak_password":
      return "auth.errors.weakPassword";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "auth.errors.rateLimited";
    case "session_not_found":
    case "session_expired":
      return "auth.errors.sessionMissing";
    default:
      return "errors.generic";
  }
}

const signUpSchema = z.object({
  displayName: z.string().trim().min(1, "validation.required").max(60, "validation.nameLength"),
  email,
  password,
  guardian: checkbox,
  terms: checkbox,
});

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, ["displayName", "email"]);
  const parsed = signUpSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    password: formData.get("password"),
    guardian: formData.get("guardian"),
    terms: formData.get("terms"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error), values };

  const next = safeNextPath(formData.get("next"));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName, guardian_attested: true },
      emailRedirectTo: `${await siteOrigin()}/auth/confirm?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) return { error: authErrorKey(error.code), values };

  // With email confirmation disabled (local dev) we already have a session.
  if (data.session) redirect(next);
  return { success: "auth.checkEmail" };
}

const signInSchema = z.object({ email, password: z.string().min(1, "validation.required") });

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, ["email"]);
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error), values };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: authErrorKey(error.code), values };

  redirect(safeNextPath(formData.get("next")));
}

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = email.safeParse(formData.get("email"));
  if (!parsed.success) {
    return { fieldErrors: { email: "validation.email" }, values: formValues(formData, ["email"]) };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${await siteOrigin()}/auth/confirm?next=/reset-password`,
  });
  // Don't reveal whether the address has an account; only surface rate limits.
  if (error?.code?.startsWith("over_")) return { error: authErrorKey(error.code) };
  return { success: "auth.resetSent" };
}

export async function updatePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = password.safeParse(formData.get("password"));
  if (!parsed.success) return { fieldErrors: { password: "validation.passwordMin" } };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) return { error: authErrorKey(error.code) };

  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
