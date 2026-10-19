import { getTranslations } from "next-intl/server";
import { ageParts } from "@/lib/age";
import { cn } from "./ui";

const avatarColors = [
  "bg-emerald-100 text-emerald-800",
  "bg-sky-100 text-sky-800",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-800",
  "bg-violet-100 text-violet-800",
];

export function ChildAvatar({ id, nickname, size = "md" }: { id: string; nickname: string; size?: "md" | "lg" }) {
  const color = avatarColors[parseInt(id.slice(0, 2), 16) % avatarColors.length];
  return (
    <div
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold",
        size === "lg" ? "size-16 text-2xl" : "size-12 text-lg",
        color,
      )}
    >
      {Array.from(nickname.trim())[0]?.toUpperCase()}
    </div>
  );
}

export async function ChildAge({ birthDate }: { birthDate: string | null }) {
  const t = await getTranslations("child");
  if (!birthDate) return <>{t("noBirthDate")}</>;
  const { years, months } = ageParts(birthDate);
  if (years === 0 && months === 0) return <>{t("newborn")}</>;
  if (years === 0) return <>{t("ageMonths", { months })}</>;
  if (months === 0) return <>{t("ageYears", { years })}</>;
  return <>{t("ageYearsMonths", { years, months })}</>;
}
