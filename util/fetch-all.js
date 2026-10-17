import supabase from "./supabase.js";

// PostgREST answers at most this many rows per request, however many the
// table holds. Asking for "everything" in one go quietly returns the first
// thousand — which is how the scrapers ended up covering 1000 of 1100+ models.
const PAGE = 1000;

/**
 * Every row of `table`, fetched a page at a time until a page comes back
 * short.
 *
 * Paged by `orderBy` (the primary key by default) so the pages are stable: a
 * row can't be skipped or read twice because the order shifted between two
 * requests.
 */
export const fetchAll = async (table, { orderBy = "id", label = table } = {}) => {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select()
      .order(orderBy, { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) {
      throw new Error(`❌ Failed to fetch ${label}: ${error.message}`);
    }

    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
};
