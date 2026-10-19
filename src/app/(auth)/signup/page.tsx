import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { safeNextPath } from "@/lib/auth";
import { AuthCard } from "../auth-card";
import { SignupForm } from "../forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("signupTitle") };
}

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const { next, email } = await searchParams;
  const t = await getTranslations("auth");
  const nextPath = safeNextPath(next);
  const loginHref = nextPath === "/dashboard" ? "/login" : `/login?next=${encodeURIComponent(nextPath)}`;

  return (
    <AuthCard
      title={t("signupTitle")}
      subtitle={t("signupSubtitle")}
      footer={
        <>
          {t("haveAccount")}{" "}
          <Link href={loginHref} className="font-medium text-primary hover:underline">
            {t("submitLogin")}
          </Link>
        </>
      }
    >
      <SignupForm next={nextPath} email={typeof email === "string" ? email : undefined} />
    </AuthCard>
  );
}
