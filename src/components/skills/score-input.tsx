"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/components/ui";
import type { SkillDimension } from "@/lib/data/projects";

// 1–5 per skill as radio groups; a skill left unset simply isn't scored.
export function ScoreInput({
  skills,
  value,
  onChange,
}: {
  skills: SkillDimension[];
  value: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
}) {
  const t = useTranslations("skills");

  return (
    <fieldset className="space-y-2 rounded-xl border border-border p-3">
      <legend className="px-1 text-sm font-medium">{t("scoreTitle")}</legend>
      <p className="text-xs text-muted">{t("scoreHint")}</p>
      {skills.map((skill) => (
        <div key={skill.id} role="radiogroup" aria-label={skill.name} className="flex flex-wrap items-center gap-2">
          <span className="w-32 truncate text-sm" title={skill.name}>
            {skill.name}
          </span>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => {
              const selected = value[skill.id] === n;
              return (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`${skill.name} ${n}`}
                  onClick={() => onChange({ ...value, [skill.id]: n })}
                  className={cn(
                    "size-9 rounded-lg border text-sm tabular-nums transition-colors",
                    selected ? "border-viz-latest bg-viz-latest font-semibold text-surface" : "border-border hover:bg-background",
                  )}
                >
                  {n}
                </button>
              );
            })}
          </div>
          {value[skill.id] !== undefined && (
            <button
              type="button"
              className="text-xs text-muted hover:underline"
              onClick={() => {
                const next = { ...value };
                delete next[skill.id];
                onChange(next);
              }}
            >
              {t("clear")}
            </button>
          )}
        </div>
      ))}
    </fieldset>
  );
}
