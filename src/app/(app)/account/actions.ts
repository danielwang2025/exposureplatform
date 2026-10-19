"use server";

import { createClient as createPlainClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { formValues, type FormState } from "@/lib/forms";
import { listSoleOwnedChildren } from "@/lib/data/account";
import { purgeMediaFiles } from "@/lib/media-cleanup";
import { cancelBilling } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

const displayName = z.string().trim().min(1, "validation.required").max(60, "validation.nameLength");

export async function updateDisplayName(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const values = formValues(formData, ["displayName"]);
  const parsed = displayName.safeParse(values.displayName);
  if (!parsed.success) return { fieldErrors: { displayName: parsed.error.issues[0].message }, values };

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ display_name: parsed.data }).eq("id", user.id);
  if (error) return { error: "errors.generic", values };

  revalidatePath("/", "layout");
  return { success: "account.saved", values };
}

// Deletes the account, every child profile the user is the only owner of
// (with all files), and the user's comments and likes. Posts and photos the
// user added to profiles that other guardians still own stay with that family.
export async function deleteAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const confirm = String(formData.get("confirm") ?? "").trim().toLowerCase();
  if (confirm !== user.email.toLowerCase()) {
    return { fieldErrors: { confirm: "account.errors.confirmEmail" } };
  }

  // Re-check the password with a throwaway client so the session cookie isn't touched.
  const verifier = createPlainClient(supabaseUrl, supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: passwordError } = await verifier.auth.signInWithPassword({
    email: user.email,
    password: String(formData.get("password") ?? ""),
  });
  if (passwordError) return { fieldErrors: { password: "auth.errors.invalidCredentials" } };
  await verifier.auth.signOut({ scope: "local" });

  const soleOwned = await listSoleOwnedChildren(user.id);
  const admin = createAdminClient();
  try {
    // Stop billing first: if this fails, nothing has been deleted yet.
    await cancelBilling(user.id);
    if (soleOwned.length > 0) {
      const ids = soleOwned.map((c) => c.id);
      const { data: media } = await admin
        .from("media")
        .select("storage_path, thumb_path, mux_asset_id, mux_upload_id")
        .in("child_id", ids);
      const { error } = await admin.from("children").delete().in("id", ids);
      if (error) throw error;
      await purgeMediaFiles(media ?? []);
    }
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw error;
  } catch (error) {
    console.error("deleteAccount failed", error);
    return { error: "errors.generic" };
  }

  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/?accountDeleted=1");
}
