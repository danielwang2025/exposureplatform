import "server-only";
import { getMux } from "@/lib/mux";
import { createAdminClient } from "@/lib/supabase/admin";

export type MediaFiles = {
  storage_path: string | null;
  thumb_path: string | null;
  mux_asset_id: string | null;
  mux_upload_id: string | null;
};

// Remove the files behind media rows that were just deleted from the database.
// Best effort: a failure here leaves an orphaned file, never exposed data
// (the storage policy requires a matching media row to read it).
export async function purgeMediaFiles(rows: MediaFiles[]) {
  if (rows.length === 0) return;
  const admin = createAdminClient();
  const paths = rows.flatMap((r) => [r.storage_path, r.thumb_path]).filter((p): p is string => Boolean(p));

  const tasks: Promise<unknown>[] = [];
  for (let i = 0; i < paths.length; i += 100) {
    tasks.push(admin.storage.from("media").remove(paths.slice(i, i + 100)));
  }

  const mux = getMux();
  if (mux) {
    for (const row of rows) {
      if (row.mux_asset_id) tasks.push(mux.video.assets.delete(row.mux_asset_id));
      else if (row.mux_upload_id) tasks.push(mux.video.uploads.cancel(row.mux_upload_id));
    }
  }

  const results = await Promise.allSettled(tasks);
  for (const result of results) {
    if (result.status === "rejected") console.error("media cleanup failed", result.reason);
  }
}
