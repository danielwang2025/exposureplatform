import { getTranslations } from "next-intl/server";
import { ChildAvatar } from "@/components/child-badge";

export async function SharedHeader({
  seed,
  nickname,
  ageYears,
  banner,
}: {
  seed: string;
  nickname: string;
  ageYears: number | null;
  banner: string;
}) {
  const t = await getTranslations("child");
  return (
    <div className="space-y-4">
      <p className="rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary">{banner}</p>
      <div className="flex items-center gap-4">
        <ChildAvatar id={seed} nickname={nickname} size="lg" />
        <div>
          <h1 className="text-2xl font-semibold">{nickname}</h1>
          {ageYears !== null && ageYears > 0 && <p className="text-sm text-muted">{t("ageYears", { years: ageYears })}</p>}
        </div>
      </div>
    </div>
  );
}
