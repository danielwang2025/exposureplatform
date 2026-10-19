"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createPost, deleteMedia, updatePost, type PostInput } from "@/app/(app)/children/post-actions";
import { Alert, Button, Field, Input, Select, cn } from "@/components/ui";
import { useMessage } from "@/components/use-message";
import { uploadImage, uploadVideo } from "@/lib/client/upload";
import type { Visibility } from "@/lib/data/children";
import type { PostKind, TimelineMedia } from "@/lib/data/posts";
import { scoreLevels } from "@/lib/skill-presets";

const kinds: { value: PostKind; icon: string }[] = [
  { value: "moment", icon: "📷" },
  { value: "milestone", icon: "🏆" },
  { value: "review", icon: "📝" },
];
const visibilityOrder: Visibility[] = ["private", "family", "link", "public"];
const MAX_FILES = 20;

type Pending = {
  key: string;
  file: File;
  kind: "image" | "video";
  previewUrl?: string;
  progress: number;
  error?: string;
  done?: boolean;
};

type Props = {
  childId: string;
  maxVisibility: Visibility;
  videoEnabled: boolean;
  projects: { id: string; title: string; emoji: string | null }[];
  // Active skills, plus archived ones this post already rates.
  skills: { id: string; name: string; emoji: string | null; archived: boolean }[];
  canManageSkills: boolean;
  defaultProjectId?: string;
  defaultKind?: PostKind;
  // Teachers: review type only, always family-visible, no project.
  reviewOnly?: boolean;
  post?: {
    id: string;
    kind: PostKind;
    title: string | null;
    body: string;
    occurredOn: string;
    visibility: Visibility;
    projectId: string | null;
    media: TimelineMedia[];
    ratings: { skillId: string; score: number }[];
  };
};

export function Composer({
  childId,
  maxVisibility,
  videoEnabled,
  projects,
  skills,
  canManageSkills,
  defaultProjectId,
  defaultKind,
  reviewOnly = false,
  post,
}: Props) {
  const t = useTranslations("posts");
  const tv = useTranslations("visibility");
  const m = useMessage();
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const today = new Date().toISOString().slice(0, 10);
  const allowedVisibilities: Visibility[] = reviewOnly
    ? ["family"]
    : visibilityOrder.slice(0, visibilityOrder.indexOf(maxVisibility) + 1);

  const [kind, setKind] = useState<PostKind>(reviewOnly ? "review" : (post?.kind ?? defaultKind ?? "moment"));
  const [ratings, setRatings] = useState<Record<string, number>>(() =>
    Object.fromEntries((post?.ratings ?? []).map((r) => [r.skillId, r.score])),
  );
  const [existing, setExisting] = useState(post?.media ?? []);
  const [files, setFiles] = useState<Pending[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [phase, setPhase] = useState<"editing" | "saving" | "uploading" | "partial">("editing");
  const [savedPostId, setSavedPostId] = useState<string | undefined>(post?.id);
  const [, startTransition] = useTransition();

  useEffect(() => () => files.forEach((f) => f.previewUrl && URL.revokeObjectURL(f.previewUrl)), [files]);

  const busy = phase === "saving" || phase === "uploading";
  const timelineUrl = `/children/${childId}`;

  function addFiles(list: FileList | null) {
    if (!list) return;
    const room = MAX_FILES - existing.length - files.length;
    const accepted: Pending[] = [];
    for (const file of Array.from(list)) {
      const isVideo = file.type.startsWith("video/");
      if (!isVideo && !file.type.startsWith("image/")) continue;
      if (isVideo && !videoEnabled) {
        setError("posts.errors.videoDisabled");
        continue;
      }
      if (accepted.length >= room) {
        setError("posts.errors.tooManyFiles");
        break;
      }
      accepted.push({
        key: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
        file,
        kind: isVideo ? "video" : "image",
        previewUrl: isVideo ? undefined : URL.createObjectURL(file),
        progress: 0,
      });
    }
    setFiles((current) => [...current, ...accepted]);
    if (accepted.length > 0) {
      setFieldErrors((current) => {
        const next = { ...current };
        delete next.body;
        return next;
      });
    }
  }

  function updateFile(key: string, patch: Partial<Pending>) {
    setFiles((current) => current.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  }

  async function uploadAll(postId: string, queue: Pending[]) {
    setPhase("uploading");
    let failed = 0;
    // Two at a time keeps phones responsive while still being quick.
    const workers = Array.from({ length: 2 }, async () => {
      while (queue.length > 0) {
        const item = queue.shift()!;
        try {
          const upload = item.kind === "image" ? uploadImage : uploadVideo;
          await upload(childId, postId, item.file, (progress) => updateFile(item.key, { progress }));
          updateFile(item.key, { done: true, progress: 1, error: undefined });
        } catch (e) {
          failed += 1;
          updateFile(item.key, { error: e instanceof Error ? e.message : "posts.errors.uploadFailed" });
        }
      }
    });
    await Promise.all(workers);

    if (failed > 0) {
      setPhase("partial");
      return;
    }
    router.push(`${timelineUrl}#post-${postId}`);
    router.refresh();
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input: PostInput = {
      kind,
      title: String(form.get("title") ?? ""),
      body: String(form.get("body") ?? ""),
      occurredOn: String(form.get("occurredOn") ?? ""),
      visibility: String(form.get("visibility") ?? "family") as Visibility,
      projectId: String(form.get("projectId") ?? ""),
      ratings: kind === "review" ? ratings : {},
    };

    setError(undefined);
    setFieldErrors({});
    setPhase("saving");

    let postId = savedPostId;
    const result = postId
      ? await updatePost(childId, postId, input)
      : await createPost(childId, { ...input, hasMedia: files.length > 0 });
    if (!result.ok) {
      // Saved, but something after (ratings) failed: further submits edit it.
      if (result.postId) setSavedPostId(result.postId);
      setFieldErrors(result.fieldErrors ?? {});
      setError(result.error);
      setPhase("editing");
      return;
    }
    if ("postId" in result) postId = result.postId as string;
    setSavedPostId(postId);

    await uploadAll(postId!, files.filter((f) => !f.done));
  }

  function retryFailed() {
    const queue = files.filter((f) => !f.done).map((f) => ({ ...f, error: undefined, progress: 0 }));
    setFiles((current) => current.map((f) => (f.done ? f : { ...f, error: undefined, progress: 0 })));
    void uploadAll(savedPostId!, queue);
  }

  function removeExisting(mediaId: string) {
    if (!window.confirm(t("removeMediaConfirm"))) return;
    startTransition(async () => {
      const result = await deleteMedia(childId, mediaId);
      if (result.ok) setExisting((current) => current.filter((x) => x.id !== mediaId));
      else setError(result.error);
    });
  }

  const titlePlaceholder = kind === "milestone" ? t("titlePlaceholderMilestone") : kind === "review" ? t("titlePlaceholderReview") : t("titlePlaceholder");

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {error && <Alert>{m(error)}</Alert>}

      <fieldset disabled={busy || phase === "partial"} className="space-y-5">
        {/* Teachers only write reviews, so there's nothing to choose. */}
        <div role="radiogroup" aria-label={t("kind")} hidden={reviewOnly} className="grid grid-cols-3 gap-2">
          {kinds.map((k) => (
            <button
              key={k.value}
              type="button"
              role="radio"
              aria-checked={kind === k.value}
              onClick={() => setKind(k.value)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-sm transition-colors",
                kind === k.value ? "border-primary bg-primary-soft font-medium text-primary" : "border-border hover:bg-background",
              )}
            >
              <span aria-hidden className="text-xl">{k.icon}</span>
              {t(`kinds.${k.value}`)}
            </button>
          ))}
        </div>

        <Field label={t("title")} htmlFor="title" error={m(fieldErrors.title)}>
          <Input id="title" name="title" maxLength={120} placeholder={titlePlaceholder} defaultValue={post?.title ?? ""} />
        </Field>

        <Field label={t("body")} htmlFor="body" error={m(fieldErrors.body)}>
          <textarea
            id="body"
            name="body"
            rows={5}
            maxLength={5000}
            placeholder={t("bodyPlaceholder")}
            defaultValue={post?.body ?? ""}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </Field>

        {kind === "review" && (
          <RatingsField
            childId={childId}
            skills={skills}
            canManageSkills={canManageSkills}
            ratings={ratings}
            onChange={setRatings}
          />
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("date")} htmlFor="occurredOn" error={m(fieldErrors.occurredOn)}>
            <Input id="occurredOn" name="occurredOn" type="date" max={today} required defaultValue={post?.occurredOn ?? today} />
          </Field>
          {reviewOnly ? (
            <Field label={t("visibility")} htmlFor="visibility" hint={t("teacherVisibilityHint")}>
              <input type="hidden" name="visibility" value="family" />
              <p id="visibility" className="flex h-10 items-center text-sm">
                👪 {tv("family")}
              </p>
            </Field>
          ) : (
          <Field label={t("visibility")} htmlFor="visibility" error={m(fieldErrors.visibility)}>
            <Select
              id="visibility"
              name="visibility"
              defaultValue={post?.visibility ?? (allowedVisibilities.includes("family") ? "family" : "private")}
            >
              {allowedVisibilities.map((v) => (
                <option key={v} value={v}>
                  {tv(v)}
                </option>
              ))}
            </Select>
          </Field>
          )}
        </div>

        {!reviewOnly && projects.length > 0 && (
          <Field label={t("project")} htmlFor="projectId">
            <Select id="projectId" name="projectId" defaultValue={post ? (post.projectId ?? "") : (defaultProjectId ?? "")}>
              <option value="">{t("noProject")}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.emoji ? `${p.emoji} ` : ""}
                  {p.title}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">{t("media")}</span>
            <span className="text-xs text-muted">{videoEnabled ? t("mediaHint") : t("mediaHintNoVideo")}</span>
          </div>

          {(existing.length > 0 || files.length > 0) && (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {existing.map((item) => (
                <li key={item.id} className="relative aspect-square overflow-hidden rounded-lg bg-background">
                  {item.thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.thumbUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <div className="flex size-full items-center justify-center text-2xl">{item.kind === "video" ? "🎬" : "🖼️"}</div>
                  )}
                  <RemoveButton label={t("removeMedia")} onClick={() => removeExisting(item.id)} />
                </li>
              ))}
              {files.map((item) => (
                <li key={item.key} className="relative aspect-square overflow-hidden rounded-lg bg-background">
                  {item.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.previewUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <div className="flex size-full flex-col items-center justify-center gap-1 p-2 text-center text-xs text-muted">
                      <span className="text-2xl">🎬</span>
                      <span className="line-clamp-2 break-all">{item.file.name}</span>
                    </div>
                  )}
                  {phase === "editing" && (
                    <RemoveButton
                      label={t("removeMedia")}
                      onClick={() => {
                        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
                        setFiles((current) => current.filter((f) => f.key !== item.key));
                      }}
                    />
                  )}
                  {phase !== "editing" && <UploadOverlay item={item} />}
                </li>
              ))}
            </ul>
          )}

          <input
            ref={fileInput}
            type="file"
            multiple
            accept={videoEnabled ? "image/*,video/*" : "image/*"}
            className="sr-only"
            data-testid="media-input"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <Button type="button" variant="secondary" onClick={() => fileInput.current?.click()}>
            + {t("addMedia")}
          </Button>
        </div>
      </fieldset>

      {phase === "partial" ? (
        <div className="space-y-3">
          <Alert>{t("someUploadsFailed")}</Alert>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={retryFailed}>
              {t("retry")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.push(timelineUrl);
                router.refresh();
              }}
            >
              {t("continueWithout")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button type="submit" disabled={busy}>
            {phase === "saving" ? t("saving") : phase === "uploading" ? t("uploading") : post ? t("save") : t("publish")}
          </Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => router.back()}>
            {t("cancel")}
          </Button>
        </div>
      )}
    </form>
  );
}

function RatingsField({
  childId,
  skills,
  canManageSkills,
  ratings,
  onChange,
}: {
  childId: string;
  skills: Props["skills"];
  canManageSkills: boolean;
  ratings: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
}) {
  const t = useTranslations("skills");

  function setScore(skillId: string, score: number | undefined) {
    const next = { ...ratings };
    if (score === undefined) delete next[skillId];
    else next[skillId] = score;
    onChange(next);
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{t("ratingsTitle")}</legend>
      {skills.length === 0 ? (
        <p className="text-sm text-muted">
          {t("noSkillsYet")}{" "}
          {canManageSkills && (
            <Link href={`/children/${childId}/settings`} className="text-primary hover:underline">
              {t("setUp")}
            </Link>
          )}
        </p>
      ) : (
        <>
          <p className="text-xs text-muted">{t("ratingsHint")}</p>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {skills.map((skill) => {
              const score = ratings[skill.id];
              return (
                <li key={skill.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm">
                    <span aria-hidden>{skill.emoji ?? "⭐"}</span> {skill.name}
                    {skill.archived && <span className="text-muted"> · {t("archivedBadge")}</span>}
                  </span>
                  <span role="radiogroup" aria-label={skill.name} className="flex items-center">
                    {scoreLevels.map((level) => (
                      <button
                        key={level}
                        type="button"
                        role="radio"
                        aria-checked={score === level}
                        aria-label={`${level} · ${t(`levels.${level}`)}`}
                        title={t(`levels.${level}`)}
                        // Clicking the current score again clears it.
                        onClick={() => setScore(skill.id, score === level ? undefined : level)}
                        className={cn(
                          "px-0.5 text-xl leading-none transition-colors",
                          score !== undefined && level <= score ? "text-amber-500" : "text-border hover:text-amber-300",
                        )}
                      >
                        ★
                      </button>
                    ))}
                  </span>
                  <span className="w-20 text-right text-xs text-muted">
                    {score !== undefined ? t(`levels.${score as 1 | 2 | 3 | 4 | 5}`) : t("notRated")}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </fieldset>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-full bg-black/60 text-sm text-white hover:bg-black/80"
    >
      ✕
    </button>
  );
}

function UploadOverlay({ item }: { item: Pending }) {
  const m = useMessage();
  if (item.done) {
    return <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-2xl text-white">✓</div>;
  }
  if (item.error) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-danger/80 p-2 text-center text-xs text-white">
        {m(item.error)}
      </div>
    );
  }
  return (
    <div className="absolute inset-x-0 bottom-0 h-1.5 bg-black/30">
      <div className="h-full bg-primary transition-all" style={{ width: `${Math.round(item.progress * 100)}%` }} />
    </div>
  );
}
