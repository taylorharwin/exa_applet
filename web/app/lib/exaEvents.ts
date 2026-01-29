import Exa from "exa-js";

import type { EventItem } from "@/app/lib/types";
import { US_STATES } from "@/app/lib/usStates";

type SearchAndContentsOptions = Parameters<Exa["searchAndContents"]>[1];

type SearchResultLike = {
  title?: unknown;
  url?: unknown;
  id?: unknown;
  text?: unknown;
  highlights?: unknown;
  image?: unknown;
  favicon?: unknown;
};

function isHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s);
}

function normalizeSourceUrl(r: SearchResultLike): string {
  const raw = String(r.url ?? r.id ?? "").trim();
  return raw && isHttpUrl(raw) ? raw : "";
}

function stateDisplay(code: string): { code: string; name: string } {
  const c = code.trim().toUpperCase();
  const name = US_STATES.find((s) => s.code === c)?.name ?? c;
  return { code: c, name };
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

  // YYYY/MM/DD or YYYY-M-D
  {
    const m = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
    if (m) {
      const y = Number(m[1]);
      const mo = Number(m[2]);
      const d = Number(m[3]);
      const dt = new Date(Date.UTC(y, mo - 1, d));
      if (!Number.isNaN(dt.getTime())) return `${y}-${pad2(mo)}-${pad2(d)}`;
    }
  }

  // M/D/YYYY
  {
    const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (m) {
      const mo = Number(m[1]);
      const d = Number(m[2]);
      const y = Number(m[3]);
      const dt = new Date(Date.UTC(y, mo - 1, d));
      if (!Number.isNaN(dt.getTime())) return `${y}-${pad2(mo)}-${pad2(d)}`;
    }
  }

  // Month name formats, e.g. "March 12" or "March 12, 2026"
  {
    const m = s.match(
      /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*\d{4})?\b/i,
    );
    if (m) {
      const token = m[0];
      const now = new Date();
      const tokenWithYear = /\d{4}/.test(token) ? token : `${token}, ${now.getFullYear()}`;
      const t0 = Date.parse(tokenWithYear);
      if (!Number.isNaN(t0)) {
        const d0 = new Date(t0);
        if (!/\d{4}/.test(token) && d0 < now) {
          const t1 = Date.parse(`${token}, ${now.getFullYear() + 1}`);
          if (!Number.isNaN(t1)) return new Date(t1).toISOString().slice(0, 10);
        }
        return d0.toISOString().slice(0, 10);
      }
    }
  }

  // Fallback: let JS parse ISO datetimes, etc.
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);

  return null;
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
    if (m) return m[0];
  }

  return null;
}

function extractLocationCandidate(text: string): string | null {
  const s = (text ?? "").replace(/\s+/g, " ").trim();
  if (!s) return null;

  const m = s.match(/\b([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,3}),\s*([A-Z]{2})\b/);
  if (m) return `${m[1]}, ${m[2]}`;

  return null;
}

function pickFirstImageUrl(r: SearchResultLike): string | undefined {
  const img = typeof r.image === "string" ? r.image.trim() : "";
  if (img && isHttpUrl(img)) return img;
  const fav = typeof r.favicon === "string" ? r.favicon.trim() : "";
  if (fav && isHttpUrl(fav)) return fav;
  return undefined;
}

function buildSearchQuery(state: string): string {
  const s = stateDisplay(state);
  // "fast" search generally does better with a natural-language query than with a huge boolean OR chain.
  return [
    `Find upcoming events in ${s.name} (${s.code}), USA.`,
    `Focus on book fairs/festivals, comic cons/conventions, pop culture conventions, author readings/signings/talks, library events, and horror festivals.`,
    `Include dates and locations (venue + city/state).`,
  ].join(" ");
}

function errToMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function shouldRetryWithLowerNumResults(msg: string): boolean {
  return /numresults|max\s*10|basic plan/i.test(msg);
}

export type ExaFetchEventsResult = {
  query: string;
  searchResults: number;
  extracted: number;
  eventsRaw: EventItem[];
};

export async function fetchEventsFromExa(params: {
  apiKey: string;
  state: string;
}): Promise<ExaFetchEventsResult> {
  const { apiKey, state } = params;
  const exa = new Exa(apiKey);

  const query = buildSearchQuery(state);
  const s = stateDisplay(state);
  const baseOpts = {
    userLocation: "US",
    // Exa "auto" is the default search type and generally yields better relevance than forcing a faster mode.
    type: "auto",
    useAutoprompt: true,
    // Social sites tend to be noisy for event extraction.
    excludeDomains: [
      "facebook.com",
      "instagram.com",
      "twitter.com",
      "x.com",
      "tiktok.com",
      "linkedin.com",
      "youtube.com",
      "youtu.be",
      "pinterest.com",
    ],
    // Explicitly request page text; we rely on it as a fallback for parsing dates/locations.
    text: { maxCharacters: 4000 },
    highlights: {
      query: `event date time location address venue city state ${s.code} ${s.name} book fair book festival author reading library event horror festival horror con`,
      numSentences: 2,
      highlightsPerUrl: 4,
    },
  } satisfies SearchAndContentsOptions;

  let searchRes: unknown;
  try {
    searchRes = await exa.searchAndContents(query, { ...baseOpts, numResults: 25 } satisfies SearchAndContentsOptions);
  } catch (err: unknown) {
    const msg = errToMessage(err);
    if (!shouldRetryWithLowerNumResults(msg)) throw err;
    searchRes = await exa.searchAndContents(query, { ...baseOpts, numResults: 10 } satisfies SearchAndContentsOptions);
  }

  const resultsUnknown = (searchRes as { results?: unknown } | null)?.results;
  const results: SearchResultLike[] = Array.isArray(resultsUnknown)
    ? resultsUnknown.map((r) => (r && typeof r === "object" ? (r as SearchResultLike) : {}))
    : [];

  const eventsRaw: EventItem[] = results.map((r) => {
    const highlightsText = Array.isArray(r.highlights) ? r.highlights.join(" ") : String(r.highlights ?? "");
    const text = String(r.text ?? "");
    const startDateCandidate =
      extractFirstDateCandidate(highlightsText) || extractFirstDateCandidate(text) || "";
    const startDateIso = toIsoDateOnlyFromUnknown(startDateCandidate) ?? "";

    const imageUrl = pickFirstImageUrl(r);
    const locationCandidate = extractLocationCandidate(highlightsText) || extractLocationCandidate(text);
    const summaryFromHighlights =
      Array.isArray(r.highlights) && r.highlights.length ? r.highlights.slice(0, 2).join(" ") : "";

    return {
      name: String(r.title ?? "").trim() || "Untitled event",
      startDate: startDateIso,
      location: locationCandidate || "See source for address.",
      targetAudience: "all ages",
      summary: summaryFromHighlights || "See source for details.",
      sourceUrl: normalizeSourceUrl(r),
      ...(imageUrl ? { imageUrl } : {}),
    };
  });

  return {
    query,
    searchResults: results.length,
    extracted: eventsRaw.length,
    eventsRaw,
  };
}

