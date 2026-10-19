import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function SiteFooter() {
  const t = await getTranslations("legal");
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-6 text-xs text-muted">
        <span>🌱 Sprout</span>
        <Link href="/privacy" className="hover:text-foreground hover:underline">
          {t("privacy")}
        </Link>
        <Link href="/terms" className="hover:text-foreground hover:underline">
          {t("terms")}
        </Link>
      </div>
    </footer>
  );
}
