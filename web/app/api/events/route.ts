import Exa from "exa-js";
import { NextResponse } from "next/server";

import type { EventItem } from "@/app/lib/types";
import { ensureEventsTable, getSql } from "@/app/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SearchAndContentsOptions = Parameters<Exa["searchAndContents"]>[1];

type SearchResultLike = {
  title?: unknown;
  url?: unknown;
  id?: unknown;
  text?: unknown;
  highlights?: unknown;
  summary?: unknown;
  image?: unknown;
  favicon?: unknown;
};

function addMonths(d: Date, months: number): Date {
  const out = new Date(d);
  out.setMonth(out.getMonth() + months);
  return out;
}

function isIsoDateOnly(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toIsoDateOnlyFromUnknown(input: string): string | null {
  const s = (input ?? "").trim();
  if (!s) return null;
  if (isIsoDateOnly(s)) return s;

  // Common numeric formats: YYYY/MM/DD or YYYY-M-D
  {
    const m = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
    if (m) {
      const y = Number(m[1]);
      const mo = Number(m[2]);
      const d = Number(m[3]);
      const dt = new Date(Date.UTC(y, mo - 1, d));
      if (!Number.isNaN(dt.getTime()) && dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1) {
        return `${y}-${pad2(mo)}-${pad2(d)}`;
      }
    }
  }

  // Common US format: M/D/YYYY
  {
    const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (m) {
      const mo = Number(m[1]);
      const d = Number(m[2]);
      const y = Number(m[3]);
      const dt = new Date(Date.UTC(y, mo - 1, d));
      if (!Number.isNaN(dt.getTime()) && dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1) {
        return `${y}-${pad2(mo)}-${pad2(d)}`;
      }
    }
  }

  // Fallback: let JS parse (handles things like "March 12, 2026" or ISO datetimes)
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);

  return null;
}

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function sortByStartDateAsc(a: EventItem, b: EventItem): number {
  // ISO date-only strings sort lexicographically by date
  return a.startDate.localeCompare(b.startDate);
}

function parseJsonObjectMaybe(input: unknown): Record<string, unknown> | null {
  if (!input) return null;
  if (typeof input === "object") return input as Record<string, unknown>;
  if (typeof input === "string") {
    const s = input.trim();
    if (!s) return null;
    try {
      const parsed = JSON.parse(s) as unknown;
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return null;
}

function pickString(obj: Record<string, unknown> | null, key: string): string {
  const v = obj?.[key];
  return typeof v === "string" ? v.trim() : "";
}

function extractFirstDateCandidate(text: string): string | null {
  const s = (text ?? "").replace(/\s+/g, " ").trim();
  if (!s) return null;

  // Prefer explicit ISO date-only.
  {
    const m = s.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    if (m) return m[1];
  }

  // Numeric date formats.
  {
    const m = s.match(/\b(\d{4}[/-]\d{1,2}[/-]\d{1,2})\b/);
    if (m) return m[1];
  }
  {
    const m = s.match(/\b(\d{1,2}[/-]\d{1,2}[/-]\d{4})\b/);
    if (m) return m[1];
  }

  // Month name formats, e.g. "March 12, 2026"
  {
    const m = s.match(
      /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*\d{4})?\b/i,
    );
    if (m) {
      const token = m[0];
      // If no year is present, assume current year (and bump to next year if already in the past).
      if (!/\d{4}/.test(token)) {
        const now = new Date();
        const assumed = `${token}, ${now.getFullYear()}`;
        const t0 = Date.parse(assumed);
        if (!Number.isNaN(t0)) {
          const d0 = new Date(t0);
          if (d0 < now) {
            const t1 = Date.parse(`${token}, ${now.getFullYear() + 1}`);
            if (!Number.isNaN(t1)) return new Date(t1).toISOString().slice(0, 10);
          }
          return d0.toISOString().slice(0, 10);
        }
      }
      return token;
    }
  }

  return null;
}

function normalizeEvent(e: EventItem): EventItem | null {
  const name = (e.name ?? "").trim();
  const startDateRaw = (e.startDate ?? "").trim();
  const endDateRaw = (e.endDate ?? "").trim();
  const locationRaw = (e.location ?? "").trim();
  const targetAudienceRaw = (e.targetAudience ?? "").trim();
  const summaryRaw = (e.summary ?? "").trim();
  const sourceUrl = (e.sourceUrl ?? "").trim();
  const imageUrlRaw = ((e as unknown as { imageUrl?: unknown })?.imageUrl ?? "") as unknown;

  if (!name || !sourceUrl) return null;

  const startDate = toIsoDateOnlyFromUnknown(startDateRaw);
  if (!startDate) return null;

  const endDateParsed = endDateRaw ? toIsoDateOnlyFromUnknown(endDateRaw) : null;
  const endDate =
    endDateParsed && endDateParsed !== startDate ? endDateParsed : null;

  const location = locationRaw || "See source for address.";
  const targetAudience = targetAudienceRaw || "all ages";
  const summary = summaryRaw || "See source for details.";
  const imageUrl = (() => {
    const s = typeof imageUrlRaw === "string" ? imageUrlRaw.trim() : "";
    if (!s) return undefined;
    if (!/^https?:\/\//i.test(s)) return undefined;
    return s;
  })();

  return {
    name,
    startDate,
    ...(endDate ? { endDate } : {}),
    location,
    targetAudience,
    summary,
    sourceUrl,
    ...(imageUrl ? { imageUrl } : {}),
  };
}

export async function POST(req: Request) {
  let stateRaw: unknown;
  let forceRefreshRaw: unknown;
  try {
    const body = (await req.json()) as { state?: unknown; forceRefresh?: unknown };
    stateRaw = body.state;
    forceRefreshRaw = body.forceRefresh;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const state = String(stateRaw ?? "").trim();
  if (!state) {
    return NextResponse.json({ error: "State is required." }, { status: 400 });
  }

  const forceRefresh =
    forceRefreshRaw === true ||
    forceRefreshRaw === "true" ||
    forceRefreshRaw === 1 ||
    forceRefreshRaw === "1";

  const now = new Date();
  const startWindow = toDateOnly(now);
  const endWindow = toDateOnly(addMonths(now, 6));

  const sql = getSql();
  const dbUrlPresent = Boolean(
    process.env.DATABASE_URL ||
      process.env.POSTGRES_URL ||
      process.env.POSTGRES_PRISMA_URL ||
      process.env.POSTGRES_URL_NON_POOLING,
  );
  let dbReadError: string | null = null;
  let dbWriteError: string | null = null;
  let dbInitError: string | null = null;

  if (!sql && dbUrlPresent) {
    dbInitError = "DB client failed to initialize (check DATABASE_URL/SSL settings).";
  }

  if (sql) {
    try {
      await ensureEventsTable(sql);
      if (!forceRefresh) {
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
          LIMIT 200
        `;

        if (Array.isArray(rows) && rows.length) {
          const maxSeen =
            rows[0]?.max_seen instanceof Date ? rows[0].max_seen.toISOString() : new Date().toISOString();

          const storedEvents: EventItem[] = rows
            .map((rUnknown) => {
              const r = (rUnknown && typeof rUnknown === "object" ? (rUnknown as Record<string, unknown>) : {}) as Record<
                string,
                unknown
              >;
              return {
                name: String(r.name ?? "").trim(),
                startDate: r.start_date instanceof Date ? toDateOnly(r.start_date) : String(r.start_date ?? ""),
                ...(r.end_date
                  ? { endDate: r.end_date instanceof Date ? toDateOnly(r.end_date) : String(r.end_date) }
                  : {}),
                location: String(r.location ?? "").trim(),
                targetAudience: String(r.target_audience ?? "").trim(),
                summary: String(r.summary ?? "").trim(),
                sourceUrl: String(r.source_url ?? "").trim(),
                ...(typeof r.image_url === "string" && r.image_url ? { imageUrl: r.image_url } : {}),
              };
            })
            .map(normalizeEvent)
            .filter((e): e is EventItem => Boolean(e))
            .sort(sortByStartDateAsc);

          return NextResponse.json(
            {
              state,
              fetchedAt: maxSeen,
              events: storedEvents,
              ...(process.env.NODE_ENV !== "production"
                ? {
                    debug: {
                      source: "db",
                      forceRefresh,
                      returned: storedEvents.length,
                      ...(dbInitError ? { dbInitError } : {}),
                    },
                  }
                : {}),
            },
            { headers: { "cache-control": "no-store" } },
          );
        }
      }
    } catch (err: unknown) {
      dbReadError = err instanceof Error ? err.message : String(err);
      // If DB read fails, fall back to live search.
    }
  }

  // If we reach here, we need to fetch (either forceRefresh, or DB had nothing).
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error: "Missing EXA_API_KEY. Add it to web/.env.local or Vercel env vars.",
        ...(process.env.NODE_ENV !== "production"
          ? { debug: { ...(dbInitError ? { dbInitError } : {}), ...(dbReadError ? { dbReadError } : {}) } }
          : {}),
      },
      { status: 500 },
    );
  }

  const exa = new Exa(apiKey);

  // Search-based approach: get many candidate pages, and extract an event from each result.
  const termBlock = [
    // Comics / fandom
    `"comic con"`,
    `"comic convention"`,
    `"comic book show"`,
    `"pop culture convention"`,
    `"fan expo"`,
    `"anime convention"`,
    `"manga convention"`,
    `"sci-fi convention"`,
    `"science fiction convention"`,
    `"fantasy convention"`,
    `"gaming convention"`,
    `"tabletop convention"`,
    `"board game convention"`,
    `"geek fest"`,
    `"toy show"`,
    `"collectibles show"`,

    // Books / publishing
    `"book festival"`,
    `"book fair"`,
    `"book fest"`,
    `"book signing"`,
    `"author reading"`,
    `"author event"`,
    `"author talk"`,
    `"author meet and greet"`,
    `"writer's festival"`,
    `"literary festival"`,

    // Horror (often branded as "horror con", "horror fest", "horror fair")
    `"horror con"`,
    `"horror convention"`,
    `"horror festival"`,
    `"horror fair"`,

    // Libraries / local community events
    `"library event"`,
    `"library program"`,
    `"library reading"`,
    `"public library event"`,
    `"friends of the library"`,
  ].join(" OR ");

  const query = [
    `${termBlock}`,
    `(${state} OR "${state}")`,
    `upcoming schedule dates location`,
  ].join(" ");

  const extractionSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      name: { type: "string" },
      startDate: { type: "string", description: "YYYY-MM-DD" },
      endDate: { type: "string", description: "YYYY-MM-DD (optional)" },
      location: { type: "string", description: "venue + city/state if possible" },
      targetAudience: { type: "string", description: 'e.g. "all ages", "families", "adults"' },
      summary: { type: "string", description: "1-2 sentences" },
    },
  } as const;

  const searchOpts = {
    userLocation: "US",
    type: "auto",
    useAutoprompt: true,
    numResults: 50,
    text: { maxCharacters: 4000 },
    highlights: {
      query: `event date time location address venue city state book fair book festival author reading library event horror festival horror con ${state}`,
      numSentences: 2,
    },
    summary: {
      query: [
        `Extract the primary upcoming event described on this page.`,
        `Prefer events in ${state} (USA) between ${startWindow} and ${endWindow}.`,
        `Events can include book fairs/festivals, author readings/signings/talks, library events, horror fairs/festivals, and comics/fandom conventions.`,
        `Return JSON matching the provided schema. Use YYYY-MM-DD for dates.`,
        `If multiple events are listed, pick one that matches the window; otherwise pick the next upcoming one.`,
      ].join(" "),
      schema: extractionSchema,
    },
  } satisfies SearchAndContentsOptions;

  let searchRes: unknown;
  try {
    searchRes = await exa.searchAndContents(query, searchOpts);
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error: "Exa request failed.",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }

  const resultsUnknown = (() => {
    const v = (searchRes as { results?: unknown } | null)?.results;
    return Array.isArray(v) ? v : [];
  })();

  const results: SearchResultLike[] = resultsUnknown.map((r) =>
    r && typeof r === "object" ? (r as SearchResultLike) : ({} as SearchResultLike),
  );

  const eventsRaw: EventItem[] = results.map((r) => {
    const summaryObj = parseJsonObjectMaybe(r.summary);
    const name = pickString(summaryObj, "name") || String(r.title ?? "").trim() || "Untitled event";

    const startDateCandidate =
      pickString(summaryObj, "startDate") ||
      (extractFirstDateCandidate(String(r.text ?? "")) ?? "") ||
      (extractFirstDateCandidate(
        Array.isArray(r.highlights) ? r.highlights.join(" ") : String(r.highlights ?? ""),
      ) ??
        "");

    const endDateCandidate = pickString(summaryObj, "endDate");

    const location =
      pickString(summaryObj, "location") || "See source for address.";

    const targetAudience =
      pickString(summaryObj, "targetAudience") || "all ages";

    const summary =
      pickString(summaryObj, "summary") ||
      (Array.isArray(r.highlights) && r.highlights.length ? String(r.highlights[0]) : "") ||
      "See source for details.";

    const sourceUrl = String(r.url ?? r.id ?? "").trim();
    const imageUrl = (() => {
      const img = typeof r.image === "string" ? r.image.trim() : "";
      if (img && /^https?:\/\//i.test(img)) return img;
      const fav = typeof r.favicon === "string" ? r.favicon.trim() : "";
      if (fav && /^https?:\/\//i.test(fav)) return fav;
      return "";
    })();

    return {
      name,
      startDate: startDateCandidate,
      ...(endDateCandidate ? { endDate: endDateCandidate } : {}),
      location,
      targetAudience,
      summary,
      sourceUrl,
      ...(imageUrl ? { imageUrl } : {}),
    };
  });

  const startCutoff = startWindow;
  const endCutoff = endWindow;

  const events = eventsRaw
    .map(normalizeEvent)
    .filter((e): e is EventItem => Boolean(e))
    .filter((e) => e.startDate >= startCutoff && e.startDate <= endCutoff)
    .sort(sortByStartDateAsc);

  // Persist base events so the page has content on first load.
  if (sql) {
    try {
      await ensureEventsTable(sql);
      for (const e of events) {
        const startDate = e.startDate;
        const endDate = e.endDate ?? null;
        await sql/* sql */ `
          INSERT INTO events (
            state, source_url, name, start_date, end_date,
            location, target_audience, summary, image_url,
            updated_at, last_seen_at
          )
          VALUES (
            ${state}, ${e.sourceUrl}, ${e.name}, ${startDate}, ${endDate},
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
    } catch (err: unknown) {
      dbWriteError = err instanceof Error ? err.message : String(err);
      // Ignore persistence failures.
    }
  }

  return NextResponse.json(
    {
      state,
      fetchedAt: new Date().toISOString(),
      events,
      ...(process.env.NODE_ENV !== "production"
        ? {
            debug: {
              query,
              searchResults: results.length,
              extracted: eventsRaw.length,
              kept: events.length,
              forceRefresh,
              source: "exa",
              ...(dbInitError ? { dbInitError } : {}),
              ...(dbReadError ? { dbReadError } : {}),
              ...(dbWriteError ? { dbWriteError } : {}),
            },
          }
        : {}),
    },
    {
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}

