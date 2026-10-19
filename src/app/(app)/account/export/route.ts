import { strToU8, Zip, ZipDeflate, ZipPassThrough } from "fflate";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// "Download my data" (GDPR access/portability). Streams a ZIP with the
// account's own data, plus every child profile the user owns or edits: posts,
// projects, comments and full-size photos. Everything is read with the user's
// own client, so RLS decides what goes in.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const supabase = await createClient();

  const [{ data: profile }, { data: memberships }, { data: myComments }] = await Promise.all([
    supabase.from("profiles").select("display_name, created_at, guardian_attested_at, storage_used_bytes").eq("id", user.id).single(),
    supabase.from("child_members").select("role, created_at, children ( id, nickname )").eq("user_id", user.id),
    supabase.from("comments").select("body, created_at, post_id, child_id").eq("author_id", user.id),
  ]);

  const stamp = new Date().toISOString().slice(0, 10);
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const zip = new Zip((error, chunk, final) => {
        if (error) return controller.error(error);
        controller.enqueue(chunk);
        if (final) controller.close();
      });
      const addText = (name: string, text: string) => {
        const file = new ZipDeflate(name, { level: 6 });
        zip.add(file);
        file.push(strToU8(text), true);
      };
      const addJson = (name: string, value: unknown) => addText(name, JSON.stringify(value, null, 2));
      const addBinary = (name: string, data: Uint8Array) => {
        // Photos are already compressed.
        const file = new ZipPassThrough(name);
        zip.add(file);
        file.push(data, true);
      };

      try {
        addText("README.txt", readme(stamp));
        addJson("account.json", {
          email: user.email,
          displayName: profile?.display_name,
          createdAt: profile?.created_at,
          guardianAttestedAt: profile?.guardian_attested_at,
          storageUsedBytes: profile?.storage_used_bytes,
          memberships: (memberships ?? []).map((m) => ({ child: m.children?.nickname, role: m.role, since: m.created_at })),
          commentsYouWrote: (myComments ?? []).map((c) => ({
            child: memberships?.find((m) => m.children?.id === c.child_id)?.children?.nickname ?? null,
            postId: c.post_id,
            body: c.body,
            createdAt: c.created_at,
          })),
        });

        for (const membership of memberships ?? []) {
          const child = membership.children;
          if (!child || membership.role === "viewer") continue;
          await addChild(child.id, `${safeName(child.nickname)}-${child.id.slice(0, 8)}`);
        }
      } catch (error) {
        console.error("export failed", error);
        addText("ERROR.txt", "The export could not be completed. Please try again.");
      }
      zip.end();

      async function addChild(childId: string, folder: string) {
        const [{ data: child }, { data: members }, { data: projects }, { data: posts }, { data: skills }, { data: reports }] =
          await Promise.all([
            supabase.from("children").select("nickname, birth_date, max_visibility, slug, created_at").eq("id", childId).single(),
            supabase.from("child_members").select("role, profiles ( display_name )").eq("child_id", childId),
            supabase.from("projects").select("id, title, description, emoji, visibility, created_at").eq("child_id", childId),
            supabase
              .from("posts")
              .select(`
                id, kind, title, body, occurred_on, visibility, created_at, project_id,
                profiles ( display_name ),
                media ( id, kind, status, position, storage_path, duration_seconds ),
                comments ( body, created_at, profiles ( display_name ) ),
                post_likes ( user_id ),
                skill_ratings ( score, skills ( name ) )
              `)
              .eq("child_id", childId)
              .order("occurred_on", { ascending: true }),
            supabase.from("skills").select("name, emoji, archived_at, created_at").eq("child_id", childId).order("position"),
            supabase
              .from("reports")
              .select("title, period_start, period_end, summary, visibility, created_at")
              .eq("child_id", childId)
              .order("period_end"),
          ]);

        addJson(`${folder}/profile.json`, {
          ...child,
          members: (members ?? []).map((m) => ({ name: m.profiles?.display_name, role: m.role })),
        });
        addJson(`${folder}/projects.json`, projects ?? []);
        if (skills?.length) addJson(`${folder}/skills.json`, skills);
        if (reports?.length) addJson(`${folder}/reports.json`, reports);

        const videos: unknown[] = [];
        const exportedPosts = [];
        for (const post of posts ?? []) {
          const photos: string[] = [];
          const media = [...post.media].sort((a, b) => a.position - b.position);
          for (const [index, item] of media.entries()) {
            if (item.kind === "video") {
              videos.push({ postId: post.id, date: post.occurred_on, durationSeconds: item.duration_seconds, status: item.status });
              continue;
            }
            if (item.status !== "ready" || !item.storage_path) continue;
            const { data: blob } = await supabase.storage.from("media").download(item.storage_path);
            if (!blob) continue;
            const name = `photos/${post.occurred_on}_${post.id.slice(0, 8)}_${index + 1}.jpg`;
            addBinary(`${folder}/${name}`, new Uint8Array(await blob.arrayBuffer()));
            photos.push(name);
          }
          exportedPosts.push({
            id: post.id,
            date: post.occurred_on,
            kind: post.kind,
            title: post.title,
            body: post.body,
            visibility: post.visibility,
            project: projects?.find((p) => p.id === post.project_id)?.title ?? null,
            author: post.profiles?.display_name ?? null,
            photos,
            ...(post.skill_ratings.length > 0 && {
              ratings: post.skill_ratings.map((r) => ({ skill: r.skills?.name ?? null, score: r.score })),
            }),
            likes: post.post_likes.length,
            comments: post.comments.map((c) => ({ author: c.profiles?.display_name, body: c.body, createdAt: c.created_at })),
          });
        }
        addJson(`${folder}/posts.json`, exportedPosts);
        if (videos.length > 0) addJson(`${folder}/videos.json`, videos);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="sprout-export-${stamp}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function safeName(value: string) {
  return value.replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 40) || "child";
}

function readme(date: string) {
  return `Sprout data export — ${date}

account.json        Your account, memberships and the comments you wrote.
<child>/profile.json  The child profile and its members.
<child>/posts.json    Every post (oldest first) with comments and photo file names.
<child>/projects.json Projects.
<child>/skills.json   Skills you follow (ratings are on each review in posts.json).
<child>/reports.json  Growth reports: period, summary and visibility.
<child>/photos/      Full-size photos, named date_post_number.jpg.
<child>/videos.json   Videos are streamed from our video provider and are not
                      included in this file. Open them in Sprout to watch them.

Child profiles are included when you are an owner or editor.

—

Sprout 数据导出 — ${date}

account.json          你的账号、所在的档案，以及你写过的评论。
<孩子>/profile.json   孩子档案及其成员。
<孩子>/posts.json     所有记录（从早到晚），含评论和照片文件名。
<孩子>/projects.json  成长项目。
<孩子>/skills.json    关注的能力项（评分记录在 posts.json 的每条点评里）。
<孩子>/reports.json   成长报告：时间段、总结和可见范围。
<孩子>/photos/        原尺寸照片，文件名为 日期_记录_序号.jpg。
<孩子>/videos.json    视频由视频服务商托管，未包含在本文件中，请在 Sprout 中观看。

仅包含你是所有者或编辑者的孩子档案。
`;
}
