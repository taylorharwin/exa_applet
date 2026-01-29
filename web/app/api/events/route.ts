import Exa from "exa-js";
import { NextResponse } from "next/server";

import type { EventItem } from "@/app/lib/types";

export const dynamic = "force-dynamic";

type AnswerSchemaResult = { events: EventItem[] };

function addMonths(d: Date, months: number): Date {
  const out = new Date(d);
  out.setMonth(out.getMonth() + months);
  return out;
}

function isIsoDateOnly(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function sortByStartDateAsc(a: EventItem, b: EventItem): number {
  // ISO date-only strings sort lexicographically by date
  return a.startDate.localeCompare(b.startDate);
}

function normalizeEvent(e: EventItem): EventItem | null {
  const name = (e.name ?? "").trim();
  const startDate = (e.startDate ?? "").trim();
  const endDate = (e.endDate ?? "").trim();
  const location = (e.location ?? "").trim();
  const targetAudience = (e.targetAudience ?? "").trim();
  const summary = (e.summary ?? "").trim();
  const sourceUrl = (e.sourceUrl ?? "").trim();

  if (!name || !location || !targetAudience || !summary || !sourceUrl) return null;
  if (!isIsoDateOnly(startDate)) return null;
  if (endDate && !isIsoDateOnly(endDate)) return null;

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
  try {
    const body = (await req.json()) as { state?: unknown };
    stateRaw = body.state;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const state = String(stateRaw ?? "").trim();
  if (!state) {
    return NextResponse.json({ error: "State is required." }, { status: 400 });
  }

  const now = new Date();
  const startPublishedDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const startWindow = toDateOnly(now);
  const endWindow = toDateOnly(addMonths(now, 6));

  const exa = new Exa(apiKey);

  const outputSchema = {
    type: "object",
    required: ["events"],
    additionalProperties: false,
    properties: {
      events: {
        type: "array",
        items: {
          type: "object",
          required: [
            "name",
            "startDate",
            "location",
            "targetAudience",
            "summary",
            "sourceUrl",
          ],
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            startDate: {
              type: "string",
              description: "YYYY-MM-DD",
            },
            endDate: {
              type: "string",
              description: "YYYY-MM-DD (optional)",
            },
            location: { type: "string" },
            targetAudience: {
              type: "string",
              description: "e.g. all ages, families, kids, teens, adults",
            },
            summary: {
              type: "string",
              description: "1-2 sentences",
            },
            sourceUrl: {
              type: "string",
              description: "A URL that supports the event details",
            },
          },
        },
      },
    },
  } as const;

  const query = [
    `Find upcoming events in ${state} (USA) related to book fairs, comic cons, and similar conventions.`,
    `Return only events happening between ${startWindow} and ${endWindow}.`,
    `Use real sources (official event pages or reputable listings). Include a sourceUrl for each event.`,
    `If an event spans multiple days, set startDate and endDate. Otherwise set only startDate.`,
    `TargetAudience should be a short label like "all ages", "families", "adults", "kids", "teens".`,
    `Keep summaries concise.`,
  ].join(" ");

  let answer: unknown;
  try {
    const res = await exa.answer(
      query,
      {
        text: true,
        outputSchema,
        // Not documented on /answer, but supported by /search; cast to avoid TS friction.
        // If the backend ignores it, it’s harmless; if it accepts it, we get the intended freshness bias.
        startPublishedDate,
      } as any,
    );
    answer = (res as any)?.answer;
  } catch (err: any) {
    return NextResponse.json(
      { error: "Exa request failed.", details: String(err?.message ?? err) },
      { status: 502 },
    );
  }

  let parsed: AnswerSchemaResult | null = null;
  if (answer && typeof answer === "object") {
    parsed = answer as AnswerSchemaResult;
  } else if (typeof answer === "string") {
    try {
      parsed = JSON.parse(answer) as AnswerSchemaResult;
    } catch {
      parsed = null;
    }
  }

  const eventsRaw = Array.isArray(parsed?.events) ? parsed!.events : [];

  const startCutoff = startWindow;
  const endCutoff = endWindow;

  const events = eventsRaw
    .map(normalizeEvent)
    .filter((e): e is EventItem => Boolean(e))
    .filter((e) => e.startDate >= startCutoff && e.startDate <= endCutoff)
    .sort(sortByStartDateAsc);

  return NextResponse.json(
    {
      state,
      fetchedAt: new Date().toISOString(),
      events,
    },
    {
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}

