"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { addSkill, deleteSkill, renameSkill } from "@/app/(app)/children/project-actions";
import { Alert, Button, Input } from "@/components/ui";
import { useMessage } from "@/components/use-message";
import type { SkillDimension } from "@/lib/data/projects";

const MAX_SKILLS = 8;

export function SkillsEditor({ childId, projectId, skills }: { childId: string; projectId: string; skills: SkillDimension[] }) {
  const t = useTranslations("skills");
  const m = useMessage();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [draft, setDraft] = useState("");

  const run = (action: () => Promise<{ ok: true } | { ok: false; error: string }>, after?: () => void) =>
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setError(undefined);
        after?.();
      } else {
        setError(result.error);
      }
    });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-medium">{t("editTitle")}</h2>
        <p className="text-sm text-muted">{t("editHint")}</p>
      </div>
      {error && <Alert>{m(error)}</Alert>}

      {skills.length > 0 && (
        <ul className="space-y-2">
          {skills.map((skill) => (
            <li key={skill.id} className="flex items-center gap-2">
              <Input
                aria-label={t("rename", { name: skill.name })}
                defaultValue={skill.name}
                maxLength={40}
                disabled={pending}
                onBlur={(e) => {
                  const name = e.target.value.trim();
                  if (name && name !== skill.name) run(() => renameSkill(childId, skill.id, name));
                }}
              />
              <Button
                type="button"
                variant="ghost"
                className="text-danger"
                disabled={pending}
                onClick={() => {
                  if (window.confirm(t("deleteConfirm", { name: skill.name }))) run(() => deleteSkill(childId, skill.id));
                }}
              >
                {t("delete")}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {skills.length < MAX_SKILLS ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const submitted = draft;
            // Only clear if the user hasn't started typing the next one meanwhile.
            if (submitted.trim()) run(() => addSkill(childId, projectId, submitted), () => setDraft((d) => (d === submitted ? "" : d)));
          }}
        >
          <Input
            aria-label={t("newSkill")}
            placeholder={t("newSkillPlaceholder")}
            value={draft}
            maxLength={40}
            onChange={(e) => setDraft(e.target.value)}
          />
          <Button type="submit" variant="secondary" disabled={pending || !draft.trim()}>
            + {t("add")}
          </Button>
        </form>
      ) : (
        <p className="text-sm text-muted">{t("limitReached")}</p>
      )}
    </div>
  );
}
