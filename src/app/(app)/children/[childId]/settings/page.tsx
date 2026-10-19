import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { atLeast, getChild, listMembers, listPendingInvitations } from "@/lib/data/children";
import { listShareLinks } from "@/lib/data/sharing";
import { updateChild } from "../../actions";
import { ChildForm } from "../../child-form";
import { DeleteChildForm, InviteForm, LeaveButton, MemberControls, PendingInvitations } from "./members";
import { PublicAddressForm, ShareLinks } from "./sharing";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("child");
  return { title: t("settings") };
}

export default async function ChildSettingsPage({ params }: PageProps<"/children/[childId]/settings">) {
  const { childId } = await params;
  const user = await requireUser();
  const child = await getChild(childId, user.id);
  if (!child) notFound();

  const isOwner = child.role === "owner";
  const [t, tm, tRoles, ts, members, invitations, links] = await Promise.all([
    getTranslations("child"),
    getTranslations("members"),
    getTranslations("roles"),
    getTranslations("sharing"),
    listMembers(child.id),
    isOwner ? listPendingInvitations(child.id) : Promise.resolve([]),
    isOwner ? listShareLinks(child.id) : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <Link href={`/children/${child.id}`} className="text-sm text-primary hover:underline">
          ← {child.nickname}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{t("settings")}</h1>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("detailsTitle")}</h2>
        <Card>
          <ChildForm
            action={updateChild.bind(null, child.id)}
            mode="edit"
            disabled={!atLeast(child.role, "editor")}
            defaults={{
              nickname: child.nickname,
              birthDate: child.birth_date,
              maxVisibility: child.max_visibility,
            }}
          />
        </Card>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">{tm("title")}</h2>
          <p className="text-sm text-muted">{tm("subtitle", { nickname: child.nickname })}</p>
        </div>
        <div className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-sm">
          {members.map((member) => {
            const name = member.displayName || tm("unnamed");
            const isSelf = member.userId === user.id;
            return (
              <div key={member.userId} className="flex flex-wrap items-center gap-3 px-6 py-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {name} {isSelf && <span className="text-muted">{tm("you")}</span>}
                  </p>
                  {!isOwner && <p className="text-sm text-muted">{tRoles(member.role)}</p>}
                </div>
                {isOwner && (
                  <MemberControls childId={child.id} userId={member.userId} name={name} role={member.role} isSelf={isSelf} />
                )}
              </div>
            );
          })}
        </div>
      </section>

      {isOwner && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">{tm("inviteTitle")}</h2>
            <p className="text-sm text-muted">{tm("inviteHint")}</p>
          </div>
          <Card className="space-y-6">
            <InviteForm childId={child.id} />
            {invitations.length > 0 && <PendingInvitations childId={child.id} invitations={invitations} />}
          </Card>
        </section>
      )}

      {isOwner && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">{ts("title")}</h2>
            <p className="text-sm text-muted">{ts("subtitle")}</p>
          </div>
          <Card className="space-y-8">
            <ShareLinks
              childId={child.id}
              links={links}
              shareable={child.max_visibility === "link" || child.max_visibility === "public"}
            />
            <PublicAddressForm childId={child.id} slug={child.slug} isPublic={child.max_visibility === "public"} />
          </Card>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-danger">{t("dangerTitle")}</h2>
        <Card className="space-y-6 border-danger/40">
          {(!isOwner || members.filter((m) => m.role === "owner").length > 1) && (
            <div className="space-y-2">
              <h3 className="font-medium">{t("leaveTitle")}</h3>
              <p className="text-sm text-muted">{t("leaveBody", { nickname: child.nickname })}</p>
              <LeaveButton childId={child.id} userId={user.id} nickname={child.nickname} />
            </div>
          )}
          {isOwner && <DeleteChildForm childId={child.id} nickname={child.nickname} />}
        </Card>
      </section>
    </div>
  );
}
