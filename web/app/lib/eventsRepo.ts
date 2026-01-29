import type { Sql } from "postgres";

import type { EventItem } from "@/app/lib/types";
import { ensureEventsTable } from "@/app/lib/db";

type DbEventRow = {
  name: unknown;
  start_date: unknown;
  end_date: unknown;
  location: unknown;
  target_audience: unknown;
  summary: unknown;
  source_url: unknown;
  image_url: unknown;
  max_seen: unknown;
};

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function readEventsFromDb(params: {
  sql: Sql;
  state: string;
  startWindow: string; // YYYY-MM-DD
  endWindow: string; // YYYY-MM-DD
  limit?: number;
}): Promise<{ events: EventItem[]; fetchedAt: string }> {
  const { sql, state, startWindow, endWindow, limit = 200 } = params;
  await ensureEventsTable(sql);

  const rows = await sql/* sql */ `
    SELECT
      name,
      start_date,
      end_date,
      location,
      target_audience,
      summary,
      source_url,
      image_url,
      MAX(last_seen_at) OVER () AS max_seen
    FROM events
    WHERE state = ${state}
      AND start_date >= ${startWindow}
      AND start_date <= ${endWindow}
    ORDER BY start_date ASC, name ASC
    LIMIT ${limit}
  `;

  const first = rows?.[0] as unknown as DbEventRow | undefined;
  const fetchedAt = first?.max_seen instanceof Date ? first.max_seen.toISOString() : new Date().toISOString();

  const events = (Array.isArray(rows) ? rows : [])
    .map((rUnknown) => {
      const r = (rUnknown ?? {}) as DbEventRow;
      return {
        name: String(r.name ?? "").trim(),
        startDate: r.start_date instanceof Date ? toDateOnly(r.start_date) : String(r.start_date ?? ""),
        ...(r.end_date ? { endDate: r.end_date instanceof Date ? toDateOnly(r.end_date) : String(r.end_date ?? "") } : {}),
        location: String(r.location ?? "").trim(),
        targetAudience: String(r.target_audience ?? "").trim(),
        summary: String(r.summary ?? "").trim(),
        sourceUrl: String(r.source_url ?? "").trim(),
        ...(typeof r.image_url === "string" && r.image_url.trim() ? { imageUrl: r.image_url } : {}),
      } satisfies EventItem;
    })
    .filter((e) => e.name && /^\d{4}-\d{2}-\d{2}$/.test(e.startDate) && e.sourceUrl);

  return { events, fetchedAt };
}

export async function upsertEventsToDb(params: {
  sql: Sql;
  state: string;
  events: EventItem[];
}): Promise<void> {
  const { sql, state, events } = params;
  await ensureEventsTable(sql);

  for (const e of events) {
    await sql/* sql */ `
      INSERT INTO events (
        state, source_url, name, start_date, end_date,
        location, target_audience, summary, image_url,
        updated_at, last_seen_at
      )
      VALUES (
        ${state}, ${e.sourceUrl}, ${e.name}, ${e.startDate}, ${e.endDate ?? null},
        ${e.location}, ${e.targetAudience}, ${e.summary}, ${e.imageUrl ?? null},
        NOW(), NOW()
      )
      ON CONFLICT (state, source_url) DO UPDATE SET
        name = EXCLUDED.name,
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        location = EXCLUDED.location,
        target_audience = EXCLUDED.target_audience,
        summary = EXCLUDED.summary,
        image_url = EXCLUDED.image_url,
        updated_at = NOW(),
        last_seen_at = NOW()
    `;
  }
}

