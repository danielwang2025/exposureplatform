import "server-only";
import { cache } from "react";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type MemberRole = Database["public"]["Enums"]["member_role"];
export type Visibility = Database["public"]["Enums"]["visibility"];
export type Child = Database["public"]["Tables"]["children"]["Row"];
export type ChildWithRole = Child & { role: MemberRole };

export const memberRoles = ["viewer", "teacher", "editor", "owner"] as const satisfies readonly MemberRole[];
export const visibilities = ["private", "family", "link", "public"] as const satisfies readonly Visibility[];

// Same order as the database enum. Teachers rank above viewers for "can see the
// child" checks but only write reviews and only read reviews (see RLS).
const roleRank: Record<MemberRole, number> = { viewer: 0, teacher: 1, editor: 2, owner: 3 };
export function atLeast(role: MemberRole, min: MemberRole) {
  return roleRank[role] >= roleRank[min];
}

// Editors and owners write anything; teachers write reviews.
export function canWriteReviews(role: MemberRole) {
  return role === "teacher" || atLeast(role, "editor");
}

export const isUuid = (value: unknown): value is string => z.uuid().safeParse(value).success;

export async function listMyChildren(userId: string): Promise<ChildWithRole[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("child_members")
    .select("role, children(*)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data.flatMap(({ role, children }) => (children ? [{ ...children, role }] : []));
}

// Returns null when the child doesn't exist or the user isn't a member (RLS).
export const getChild = cache(async (childId: string, userId: string): Promise<ChildWithRole | null> => {
  if (!isUuid(childId)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("child_members")
    .select("role, children(*)")
    .eq("child_id", childId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.children ? { ...data.children, role: data.role } : null;
});

export type Member = {
  userId: string;
  role: MemberRole;
  displayName: string;
  joinedAt: string;
};

export async function listMembers(childId: string): Promise<Member[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("child_members")
    .select("user_id, role, created_at, profiles(display_name)")
    .eq("child_id", childId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data.map((row) => ({
    userId: row.user_id,
    role: row.role,
    displayName: row.profiles?.display_name ?? "",
    joinedAt: row.created_at,
  }));
}

export type PendingInvitation = {
  id: string;
  email: string;
  role: MemberRole;
  token: string;
  expiresAt: string;
};

// Owners only; RLS returns nothing for other roles.
export async function listPendingInvitations(childId: string): Promise<PendingInvitation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invitations")
    .select("id, email, role, token, expires_at")
    .eq("child_id", childId)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    token: row.token,
    expiresAt: row.expires_at,
  }));
}
