import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { MediaGallery } from "@/components/timeline/media-gallery";
import { PostActionsMenu } from "@/app/(app)/children/[childId]/post-actions-menu";
import { PostSocial } from "@/components/timeline/post-social";
import { cn } from "@/components/ui";
import { ageParts } from "@/lib/age";
import type { TimelinePost } from "@/lib/data/posts";

const kindStyles = {
  moment: null,
  milestone: { icon: "🏆", className: "bg-amber-100 text-amber-800" },
  review: { icon: "📝", className: "bg-sky-100 text-sky-800" },
} as const;

export const visibilityIcons = { private: "🔒", family: "👪", link: "🔗", public: "🌍" } as const;

type Props =
  | {
      variant: "member";
      post: TimelinePost;
      childId: string;
      birthDate: string | null;
      isOwner: boolean;
    }
  // Shared/public pages: no author, visibility, age-at-the-time or actions —
  // a date plus an age would reveal the birth date.
  | { variant: "shared"; post: TimelinePost };

export async function PostCard(props: Props) {
  const { post } = props;
  const [t, tv, tc, format] = await Promise.all([
    getTranslations("posts"),
    getTranslations("visibility"),
    getTranslations("child"),
    getFormatter(),
  ]);
  const kindStyle = kindStyles[post.kind];
  const date = new Date(`${post.occurredOn}T00:00:00`);
  const member = props.variant === "member" ? props : null;
  const age = member?.birthDate && post.occurredOn >= member.birthDate ? ageParts(member.birthDate, date) : null;
  const canShare = Boolean(member?.isOwner && (post.visibility === "link" || post.visibility === "public"));

  const projectLabel = post.project && (
    <>
      {post.project.emoji ?? "📁"} {post.project.title}
    </>
  );

  return (
    <article id={`post-${post.id}`} className="scroll-mt-20 space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            {kindStyle && (
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", kindStyle.className)}>
                {kindStyle.icon} {t(`kinds.${post.kind}`)}
              </span>
            )}
            <time dateTime={post.occurredOn} className="font-medium">
              {format.dateTime(date, { dateStyle: "medium" })}
            </time>
            {age && (
              <span className="text-muted">
                ·{" "}
                {age.years === 0
                  ? tc("ageMonths", { months: age.months })
                  : age.months === 0
                    ? tc("ageYears", { years: age.years })
                    : tc("ageYearsMonths", { years: age.years, months: age.months })}
              </span>
            )}
          </div>
          {member && (
            <p className="mt-0.5 text-xs text-muted">
              {post.authorName || t("unknownAuthor")} ·{" "}
              <span title={tv(`${post.visibility}Hint`)}>
                {visibilityIcons[post.visibility]} {tv(post.visibility)}
              </span>
            </p>
          )}
          {post.project &&
            (member && post.project.id ? (
              <Link
                href={`/children/${member.childId}/projects/${post.project.id}`}
                className="mt-1.5 inline-block rounded-full bg-primary-soft px-2 py-0.5 text-xs text-primary hover:underline"
              >
                {projectLabel}
              </Link>
            ) : (
              <span className="mt-1.5 inline-block rounded-full bg-primary-soft px-2 py-0.5 text-xs text-primary">
                {projectLabel}
              </span>
            ))}
        </div>
        {member && (post.canEdit || canShare) && (
          <PostActionsMenu childId={member.childId} postId={post.id} canEdit={post.canEdit} canShare={canShare} />
        )}
      </header>

      {post.title && <h3 className="text-lg font-semibold">{post.title}</h3>}
      {post.body && <p className="whitespace-pre-wrap break-words leading-relaxed">{post.body}</p>}
      <MediaGallery media={post.media} />
      {member && post.social && (
        <PostSocial
          childId={member.childId}
          postId={post.id}
          likeCount={post.social.likeCount}
          likedByMe={post.social.likedByMe}
          commentCount={post.social.commentCount}
        />
      )}
    </article>
  );
}
