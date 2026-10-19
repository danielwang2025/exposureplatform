import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Alert, buttonClass } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";

export default async function Home({ searchParams }: PageProps<"/">) {
  const { accountDeleted } = await searchParams;
  const [t, user] = await Promise.all([getTranslations("landing"), getCurrentUser()]);

  const features = [
    { icon: "📅", title: t("features.timelineTitle"), body: t("features.timelineBody") },
    { icon: "🎹", title: t("features.projectsTitle"), body: t("features.projectsBody") },
    { icon: "🔒", title: t("features.privacyTitle"), body: t("features.privacyBody") },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:py-24">
      {accountDeleted && (
        <div className="mx-auto mb-10 max-w-2xl">
          <Alert tone="success">{t("accountDeleted")}</Alert>
        </div>
      )}
      <section className="mx-auto max-w-2xl space-y-6 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{t("title")}</h1>
        <p className="text-lg text-muted">{t("subtitle")}</p>
        <Link href={user ? "/dashboard" : "/signup"} className={buttonClass("primary", "h-12 px-6 text-base")}>
          {user ? t("ctaSignedIn") : t("cta")}
        </Link>
      </section>

      <section className="mt-20 grid gap-6 sm:grid-cols-3">
        {features.map((feature) => (
          <div key={feature.title} className="rounded-2xl border border-border bg-surface p-6">
            <div aria-hidden className="text-3xl">{feature.icon}</div>
            <h2 className="mt-3 font-semibold">{feature.title}</h2>
            <p className="mt-1 text-sm text-muted">{feature.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
