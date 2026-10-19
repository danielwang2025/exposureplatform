"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { addSkills, deleteSkill, setSkillArchived, updateSkill } from "@/app/(app)/children/skill-actions";
import { Button, Input } from "@/components/ui";
import { useMessage } from "@/components/use-message";
import { skillPresets } from "@/lib/skill-presets";

type SkillItem = { id: string; name: string; emoji: string | null; archived: boolean };

export function SkillsManager({
  childId,
  skills,
  canEdit,
  canDelete,
  maxActive,
}: {
  childId: string;
  skills: SkillItem[];
  canEdit: boolean;
  canDelete: boolean;
  maxActive: number;
}) {
  const t = useTranslations("skills");
  const m = useMessage();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [editingId, setEditingId] = useState<string>();

  const active = skills.filter((s) => !s.archived);
  const archived = skills.filter((s) => s.archived);
  const taken = new Set(active.map((s) => s.name.trim().toLowerCase()));
  const presets = skillPresets
    .map((p) => ({ ...p, name: t(`presets.${p.key}`) }))
    .filter((p) => !taken.has(p.name.toLowerCase()));
  const full = active.length >= maxActive;

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, onDone?: () => void) {
    setError(undefined);
    startTransition(async () => {
      const result = await action();
      if (result.ok) onDone?.();
      else setError(result.error);
    });
  }

  return (
    <div className="space-y-5">
      {error && <p className="text-sm text-danger">{m(error)}</p>}

      {active.length === 0 ? (
        <p className="text-sm text-muted">{canEdit ? t("emptyEditor") : t("empty")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {active.map((skill) =>
            editingId === skill.id ? (
              <li key={skill.id} className="py-2">
                <SkillForm
                  defaults={skill}
                  submitLabel={t("save")}
                  pending={pending}
                  onCancel={() => setEditingId(undefined)}
                  onSubmit={(input) => run(() => updateSkill(childId, skill.id, input), () => setEditingId(undefined))}
                />
              </li>
            ) : (
              <li key={skill.id} className="flex items-center gap-3 py-2">
                <span className="flex-1 truncate">
                  <span aria-hidden>{skill.emoji ?? "⭐"}</span> {skill.name}
                </span>
                {canEdit && (
                  <>
                    <Button variant="ghost" className="h-8 px-2 text-sm" disabled={pending} onClick={() => setEditingId(skill.id)}>
                      {t("rename")}
                    </Button>
                    <Button
                      variant="ghost"
                      className="h-8 px-2 text-sm"
                      disabled={pending}
                      onClick={() => run(() => setSkillArchived(childId, skill.id, true))}
                    >
                      {t("archive")}
                    </Button>
                  </>
                )}
              </li>
            ),
          )}
        </ul>
      )}

      {canEdit && !full && (
        <div className="space-y-3">
          {presets.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">{t("suggested")}</p>
              <div className="flex flex-wrap gap-2">
                {presets.slice(0, maxActive - active.length).map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => addSkills(childId, [{ name: p.name, emoji: p.emoji }]))}
                    className="rounded-full border border-border px-3 py-1 text-sm hover:bg-background disabled:opacity-50"
                  >
                    + {p.emoji} {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("addCustom")}</p>
            <SkillForm
              key={active.length}
              submitLabel={t("add")}
              pending={pending}
              onSubmit={(input) => run(() => addSkills(childId, [input]))}
            />
          </div>
        </div>
      )}
      {canEdit && full && <p className="text-sm text-muted">{t("limitReached", { max: maxActive })}</p>}

      {archived.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted">{t("archived", { count: archived.length })}</summary>
          <ul className="mt-2 divide-y divide-border">
            {archived.map((skill) => (
              <li key={skill.id} className="flex items-center gap-3 py-2">
                <span className="flex-1 truncate text-muted">
                  <span aria-hidden>{skill.emoji ?? "⭐"}</span> {skill.name}
                </span>
                {canEdit && (
                  <Button
                    variant="ghost"
                    className="h-8 px-2 text-sm"
                    disabled={pending || full}
                    onClick={() => run(() => setSkillArchived(childId, skill.id, false))}
                  >
                    {t("restore")}
                  </Button>
                )}
                {canDelete && (
                  <Button
                    variant="ghost"
                    className="h-8 px-2 text-sm text-danger"
                    disabled={pending}
                    onClick={() => {
                      if (!window.confirm(t("deleteConfirm", { name: skill.name }))) return;
                      run(() => deleteSkill(childId, skill.id));
                    }}
                  >
                    {t("delete")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">{t("archivedHint")}</p>
        </details>
      )}
    </div>
  );
}

function SkillForm({
  defaults,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
}: {
  defaults?: { name: string; emoji: string | null };
  submitLabel: string;
  pending: boolean;
  onSubmit: (input: { name: string; emoji: string }) => void;
  onCancel?: () => void;
}) {
  const t = useTranslations("skills");
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        onSubmit({ name: String(form.get("name") ?? ""), emoji: String(form.get("emoji") ?? "") });
      }}
    >
      {/* Input is w-full, so the wrappers set the widths. */}
      <div className="w-16 shrink-0">
        <Input
          name="emoji"
          aria-label={t("emoji")}
          placeholder="⭐"
          maxLength={16}
          defaultValue={defaults?.emoji ?? ""}
          className="text-center"
        />
      </div>
      <div className="min-w-32 flex-1">
        <Input
          name="name"
          aria-label={t("name")}
          placeholder={t("namePlaceholder")}
          maxLength={40}
          required
          defaultValue={defaults?.name ?? ""}
        />
      </div>
      <Button type="submit" variant="secondary" disabled={pending}>
        {submitLabel}
      </Button>
      {onCancel && (
        <Button type="button" variant="ghost" disabled={pending} onClick={onCancel}>
          {t("cancel")}
        </Button>
      )}
    </form>
  );
}
