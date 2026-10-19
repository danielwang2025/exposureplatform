import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { signOut } from "@/app/(auth)/actions";
import { getCurrentUser } from "@/lib/auth";
import type { Locale } from "@/i18n/config";
import { LanguageSwitcher } from "./language-switcher";
import { buttonClass } from "./ui";

export async function SiteHeader() {
  const [t, user, locale] = await Promise.all([
    getTranslations("nav"),
    getCurrentUser(),
    getLocale(),
  ]);

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
        <Link href={user ? "/dashboard" : "/"} className="flex items-center gap-2 font-semibold">
          <span aria-hidden className="text-xl">🌱</span>
          Sprout
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <LanguageSwitcher current={locale as Locale} label={t("language")} />
          {user ? (
            <>
              <span className="hidden sm:block">
                <Link href="/dashboard" className={buttonClass("ghost")}>
                  {t("dashboard")}
                </Link>
              </span>
              <Link href="/account" className={buttonClass("ghost")} aria-label={t("account")}>
                <span aria-hidden>👤</span>
                <span className="hidden sm:inline">{t("account")}</span>
              </Link>
              <form action={signOut}>
                <button type="submit" className={buttonClass("secondary")}>
                  {t("logout")}
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className={buttonClass("ghost")}>
                {t("login")}
              </Link>
              <Link href="/signup" className={buttonClass("primary")}>
                {t("signup")}
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
