import "server-only";
import { createClient } from "@/lib/supabase/server";

export type AccountSummary = {
  displayName: string;
  storageUsed: number;
  storageQuota: number;
};

export async function getAccount(userId: string): Promise<AccountSummary> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("display_name, storage_used_bytes, storage_quota_bytes")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return {
    displayName: data.display_name,
    storageUsed: data.storage_used_bytes,
    storageQuota: data.storage_quota_bytes,
  };
}

// Child profiles that would be deleted with this account: the user owns them
// and nobody else does.
export async function listSoleOwnedChildren(userId: string): Promise<{ id: string; nickname: string }[]> {
  const supabase = await createClient();
  const { data: owned, error } = await supabase
    .from("child_members")
    .select("child_id, children ( nickname )")
    .eq("user_id", userId)
    .eq("role", "owner");
  if (error) throw error;
  if (owned.length === 0) return [];

  const { data: owners, error: ownersError } = await supabase
    .from("child_members")
    .select("child_id, user_id")
    .in("child_id", owned.map((o) => o.child_id))
    .eq("role", "owner");
  if (ownersError) throw ownersError;

  return owned
    .filter((o) => owners.filter((x) => x.child_id === o.child_id).length === 1)
    .map((o) => ({ id: o.child_id, nickname: o.children?.nickname ?? "" }));
}
