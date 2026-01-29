import Exa from "exa-js";
import { NextResponse } from "next/server";

import type { EventItem } from "@/app/lib/types";

export const dynamic = "force-dynamic";

type SearchAndContentsOptions = Parameters<Exa["searchAndContents"]>[1];

type SearchResultLike = {
  title?: unknown;
  url?: unknown;
  id?: unknown;
  text?: unknown;
  highlights?: unknown;
  summary?: unknown;
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

  if (!name || !sourceUrl) return null;

  const startDate = toIsoDateOnlyFromUnknown(startDateRaw);
  if (!startDate) return null;

  const endDateParsed = endDateRaw ? toIsoDateOnlyFromUnknown(endDateRaw) : null;
  const endDate =
    endDateParsed && endDateParsed !== startDate ? endDateParsed : null;

  const location = locationRaw || "See source for address.";
  const targetAudience = targetAudienceRaw || "all ages";
  const summary = summaryRaw || "See source for details.";

  return {
    name,
    startDate,
    ...(endDate ? { endDate } : {}),
    location,
    targetAudience,
    summary,
    sourceUrl,
  };
}

export async function POST(req: Request) {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing EXA_API_KEY. Add it to web/.env.local." },
      { status: 500 },
    );
  }

  let stateRaw: unknown;
  let userProfileRaw: unknown;
  try {
    const body = (await req.json()) as { state?: unknown; userProfile?: unknown };
    stateRaw = body.state;
    userProfileRaw = body.userProfile;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const state = String(stateRaw ?? "").trim();
  if (!state) {
    return NextResponse.json({ error: "State is required." }, { status: 400 });
  }

  const userProfile = String(userProfileRaw ?? "").trim().slice(0, 1200);

  const now = new Date();
  const startWindow = toDateOnly(now);
  const endWindow = toDateOnly(addMonths(now, 6));

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

    return {
      name,
      startDate: startDateCandidate,
      ...(endDateCandidate ? { endDate: endDateCandidate } : {}),
      location,
      targetAudience,
      summary,
      sourceUrl,
    };
  });

  const startCutoff = startWindow;
  const endCutoff = endWindow;

  const events = eventsRaw
    .map(normalizeEvent)
    .filter((e): e is EventItem => Boolean(e))
    .filter((e) => e.startDate >= startCutoff && e.startDate <= endCutoff)
    .sort(sortByStartDateAsc);

  let eventsWithRelevance: EventItem[] = events;
  let scoringDebug:
    | {
        attempted: number;
        returned: number;
        applied: number;
        error?: string;
      }
    | undefined;

  if (userProfile && events.length) {
    const toScore = events.slice(0, 25);
    const scoreSchema = {
      type: "object",
      required: ["scores"],
      additionalProperties: false,
      properties: {
        scores: {
          type: "array",
          items: {
            type: "object",
            required: ["index", "relevance"],
            additionalProperties: false,
            properties: {
              index: { type: "integer", minimum: 0, maximum: 24 },
              relevance: { type: "integer", minimum: 1, maximum: 10 },
            },
          },
        },
      },
    } as const;

    const scoringPrompt = [
      `You are rating event relevance for a user.`,
      ``,
      `User profile:`,
      userProfile,
      ``,
      `Instructions:`,
      `- For each event below, output an integer relevance from 1 (not relevant) to 10 (highly relevant).`,
      `- Use the event's index to identify it.`,
      `- Consider the user's stated interests, age group, preferences, and constraints.`,
      `- Do not invent details. If unclear, choose a middle score (4-6).`,
      ``,
      `Events (JSON):`,
      JSON.stringify(
        toScore.map((e, index) => ({
          index,
          sourceUrl: e.sourceUrl,
          name: e.name,
          date: e.endDate ? `${e.startDate} -> ${e.endDate}` : e.startDate,
          location: e.location,
          audience: e.targetAudience,
          summary: e.summary,
        })),
      ),
    ].join("\n");

    type AnswerOptions = Parameters<Exa["answer"]>[1];
    type AnswerResponseLike = { answer?: unknown };

    try {
      const answerOpts = {
        text: false,
        outputSchema: scoreSchema,
      } satisfies AnswerOptions;

      const ans: unknown = await exa.answer(scoringPrompt, answerOpts);
      const obj = parseJsonObjectMaybe((ans as AnswerResponseLike)?.answer);
      const scoresArr = Array.isArray(obj?.scores) ? (obj!.scores as unknown[]) : [];
      const scoreByIndex = new Map<number, number>();
      for (const item of scoresArr) {
        if (!item || typeof item !== "object") continue;
        const it = item as Record<string, unknown>;
        const idx = typeof it.index === "number" ? it.index : Number(it.index);
        const rel = typeof it.relevance === "number" ? it.relevance : Number(it.relevance);
        if (!Number.isFinite(idx) || idx < 0 || idx >= toScore.length) continue;
        if (Number.isFinite(rel)) {
          const rounded = Math.max(1, Math.min(10, Math.round(rel)));
          scoreByIndex.set(Math.round(idx), rounded);
        }
      }

      let applied = 0;
      eventsWithRelevance = events.map((e, i) => {
        if (i < toScore.length && scoreByIndex.has(i)) {
          applied += 1;
          return { ...e, relevance: scoreByIndex.get(i)! };
        }
        return e;
      });
      scoringDebug = {
        attempted: toScore.length,
        returned: scoresArr.length,
        applied,
      };
    } catch (err: unknown) {
      // If relevance scoring fails, still return events without scores.
      eventsWithRelevance = events;
      scoringDebug = {
        attempted: toScore.length,
        returned: 0,
        applied: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return NextResponse.json(
    {
      state,
      fetchedAt: new Date().toISOString(),
      events: eventsWithRelevance,
      ...(process.env.NODE_ENV !== "production"
        ? {
            debug: {
              query,
              searchResults: results.length,
              extracted: eventsRaw.length,
              kept: events.length,
              scored: userProfile ? Math.min(25, events.length) : 0,
              scoring: scoringDebug,
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

