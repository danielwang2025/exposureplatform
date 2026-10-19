import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui";
import { safeNextPath } from "@/lib/auth";
import { AuthCard } from "../auth-card";
import { LoginForm } from "../forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("loginTitle") };
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  const t = await getTranslations("auth");
  const nextPath = safeNextPath(next);
  const signupHref = nextPath === "/dashboard" ? "/signup" : `/signup?next=${encodeURIComponent(nextPath)}`;

  return (
    <AuthCard
      title={t("loginTitle")}
      footer={
        <>
          {t("noAccount")}{" "}
          <Link href={signupHref} className="font-medium text-primary hover:underline">
            {t("submitSignup")}
          </Link>
        </>
      }
    >
      {error === "confirm" && <Alert>{t("confirmFailed")}</Alert>}
      <LoginForm next={nextPath} />
    </AuthCard>
  );
}
