import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { AuthCard } from "../auth-card";
import { ResetPasswordForm } from "../forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("resetTitle") };
}

// Reached from the reset email via /auth/confirm, which signs the user in first.
export default async function ResetPasswordPage() {
  await requireUser();
  const t = await getTranslations("auth");
  return (
    <AuthCard title={t("resetTitle")}>
      <ResetPasswordForm />
    </AuthCard>
  );
}
