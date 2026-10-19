import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";

const PAGE = 1000;

// PostgREST caps each response at 1000 rows. For queries that can exceed that
// (years of ratings, a long report period), fetch page by page. The query
// needs a stable order for the pages to line up.
export async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}
