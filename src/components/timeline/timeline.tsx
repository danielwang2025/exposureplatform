import { getFormatter } from "next-intl/server";
import type { TimelinePost } from "@/lib/data/posts";
import { PostCard } from "./post-card";

type CardContext =
  | { variant: "member"; childId: string; birthDate: string | null; isOwner: boolean }
  | { variant: "shared" };

// Posts grouped under sticky month headings, in the order given.
export async function Timeline({ posts, card }: { posts: TimelinePost[]; card: CardContext }) {
  const format = await getFormatter();

  const groups: { key: string; label: string; posts: TimelinePost[] }[] = [];
  for (const post of posts) {
    const key = post.occurredOn.slice(0, 7);
    let group = groups.at(-1);
    if (group?.key !== key) {
      group = {
        key,
        label: format.dateTime(new Date(`${key}-01T00:00:00`), { year: "numeric", month: "long" }),
        posts: [],
      };
      groups.push(group);
    }
    group.posts.push(post);
  }

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <section key={group.key} className="space-y-4">
          <h2 className="sticky top-0 z-10 -mx-4 bg-background/90 px-4 py-2 text-sm font-semibold text-muted backdrop-blur">
            {group.label}
          </h2>
          {group.posts.map((post) => (
            <PostCard key={post.id} post={post} {...card} />
          ))}
        </section>
      ))}
    </div>
  );
}
