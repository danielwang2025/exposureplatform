import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui";
import { createChild } from "../actions";
import { ChildForm } from "../child-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("child");
  return { title: t("newTitle") };
}

export default async function NewChildPage() {
  const t = await getTranslations("child");
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("newTitle")}</h1>
        <p className="text-sm text-muted">{t("newSubtitle")}</p>
      </div>
      <Card>
        <ChildForm action={createChild} mode="create" />
      </Card>
    </div>
  );
}
