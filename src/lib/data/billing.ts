import "server-only";
import { cache } from "react";
import { isVideoEnabled } from "@/lib/mux";
import { isBillingEnabled, type BillingInterval } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";

export type MyPlan = {
  plus: boolean;
  status: string | null;
  interval: BillingInterval | null;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  usedBytes: number;
  quotaBytes: number;
  lockedCount: number;
};

const ENTITLED = ["active", "trialing", "past_due"];

// The signed-in user's own plan (RLS: users read only their own row).
export const getMyPlan = cache(async (userId: string): Promise<MyPlan> => {
  const supabase = await createClient();
  const [{ data: sub }, { data: profile }, { count }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("status, billing_interval, current_period_end, cancel_at_period_end")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("profiles").select("storage_used_bytes, storage_quota_bytes").eq("id", userId).single(),
    supabase.from("media").select("id", { count: "exact", head: true }).eq("uploader_id", userId).eq("locked", true),
  ]);
  return {
    plus: ENTITLED.includes(sub?.status ?? ""),
    status: sub?.status ?? null,
    interval: (sub?.billing_interval as BillingInterval | null) ?? null,
    periodEnd: sub?.current_period_end ?? null,
    cancelAtPeriodEnd: sub?.cancel_at_period_end ?? false,
    usedBytes: profile?.storage_used_bytes ?? 0,
    quotaBytes: profile?.storage_quota_bytes ?? 0,
    lockedCount: count ?? 0,
  };
});

// Video needs Mux; once payments are set up it is also a Plus feature.
export async function canUploadVideo(userId: string) {
  if (!isVideoEnabled()) return false;
  if (!isBillingEnabled()) return true;
  return (await getMyPlan(userId)).plus;
}
