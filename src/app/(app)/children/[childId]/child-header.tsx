import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChildAge, ChildAvatar } from "@/components/child-badge";
import { buttonClass, cn } from "@/components/ui";
import { atLeast, type ChildWithRole } from "@/lib/data/children";

type Tab = "timeline" | "milestones" | "projects" | "skills";

export async function ChildHeader({ child, active }: { child: ChildWithRole; active: Tab }) {
  const [t, tp, tRoles, tTabs] = await Promise.all([
    getTranslations("child"),
    getTranslations("posts"),
    getTranslations("roles"),
    getTranslations("tabs"),
  ]);
  const base = `/children/${child.id}`;
  const tabs: { key: Tab; href: string }[] = [
    { key: "timeline", href: base },
    { key: "milestones", href: `${base}/milestones` },
    { key: "projects", href: `${base}/projects` },
    { key: "skills", href: `${base}/skills` },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <ChildAvatar id={child.id} nickname={child.nickname} size="lg" />
        {/* min width lets the buttons wrap below on phones instead of squeezing the name. */}
        <div className="min-w-40 flex-1">
          <h1 className="truncate text-2xl font-semibold">{child.nickname}</h1>
          <p className="text-sm text-muted">
            <ChildAge birthDate={child.birth_date} /> · {tRoles(child.role)}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`${base}/settings`} className={buttonClass("secondary")}>
            {t("settings")}
          </Link>
          {atLeast(child.role, "editor") && (
            <Link href={`${base}/posts/new`} className={buttonClass("primary")}>
              + {tp("new")}
            </Link>
          )}
        </div>
      </div>
      <nav className="flex gap-1 border-b border-border" aria-label={child.nickname}>
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={tab.key === active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              tab.key === active ? "border-primary text-primary" : "border-transparent text-muted hover:text-foreground",
            )}
          >
            {tTabs(tab.key)}
          </Link>
        ))}
      </nav>
    </div>
  );
}
