import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buttonClass } from "@/components/ui";

export default async function NotFound() {
  const t = await getTranslations("notFound");
  return (
    <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-3 px-4 py-20 text-center">
      <span aria-hidden className="text-4xl">🌱</span>
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <p className="text-sm text-muted">{t("body")}</p>
      <Link href="/" className={buttonClass("secondary", "mt-2")}>
        {t("home")}
      </Link>
    </div>
  );
}
