import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { signOut } from "@/app/(auth)/actions";
import { buttonClass, Card } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AcceptInvitationButton } from "./accept-button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("invite");
  return { title: t("title") };
}

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const supabase = await createClient();
  const [t, tRoles, user, { data }] = await Promise.all([
    getTranslations("invite"),
    getTranslations("roles"),
    getCurrentUser(),
    supabase.rpc("get_invitation", { p_token: token }),
  ]);
  const invitation = data?.[0];
  const next = `/invite/${token}`;

  return (
    <div className="flex flex-1 items-start justify-center px-4 py-12 sm:py-20">
      <Card className="w-full max-w-md space-y-5">
        <h1 className="text-xl font-semibold">{t("title")}</h1>

        {!invitation ? (
          <p className="text-muted">{t("notFound")}</p>
        ) : invitation.status === "expired" ? (
          <p className="text-muted">{t("expired")}</p>
        ) : invitation.status === "accepted" ? (
          <p className="text-muted">{t("accepted")}</p>
        ) : (
          <>
            <p>
              {t("body", {
                inviter: invitation.inviter_name || t("someone"),
                nickname: invitation.child_nickname,
                role: invitation.role,
              })}
            </p>
            <p className="text-sm text-muted">
              {tRoles(invitation.role)}: {tRoles(invitation.role === "editor" ? "editorHint" : "viewerHint")}
            </p>

            {!user ? (
              <>
                <p className="text-sm text-muted">{t("sentTo", { email: invitation.email })}</p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Link
                    href={`/signup?next=${encodeURIComponent(next)}&email=${encodeURIComponent(invitation.email)}`}
                    className={buttonClass("primary", "sm:flex-1")}
                  >
                    {t("signupToAccept")}
                  </Link>
                  <Link href={`/login?next=${encodeURIComponent(next)}`} className={buttonClass("secondary", "sm:flex-1")}>
                    {t("loginToAccept")}
                  </Link>
                </div>
              </>
            ) : user.email.toLowerCase() !== invitation.email.toLowerCase() ? (
              <>
                <p className="text-sm text-danger">
                  {t("wrongAccount", { current: user.email, email: invitation.email })}
                </p>
                <form action={signOut}>
                  <button type="submit" className={buttonClass("secondary")}>
                    {(await getTranslations("nav"))("logout")}
                  </button>
                </form>
              </>
            ) : (
              <AcceptInvitationButton token={token} />
            )}
          </>
        )}
      </Card>
    </div>
  );
}
