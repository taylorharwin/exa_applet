import { NextResponse } from "next/server";

import { getSql } from "@/app/lib/db";
import { fetchEventsFromExa } from "@/app/lib/exaEvents";
import { readEventsFromDb, upsertEventsToDb } from "@/app/lib/eventsRepo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function addMonths(d: Date, months: number): Date {
  const out = new Date(d);
  out.setMonth(out.getMonth() + months);
  return out;
}

function isTruthy(v: unknown): boolean {
  return v === true || v === "true" || v === 1 || v === "1";
}

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dbEnvPresent(): boolean {
  return Boolean(
    process.env.DATABASE_URL_UNPOOLED ||
      process.env.DATABASE_URL ||
      process.env.POSTGRES_URL ||
      process.env.POSTGRES_PRISMA_URL ||
      process.env.POSTGRES_URL_NON_POOLING,
  );
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

  const state = String(stateRaw ?? "").trim().toUpperCase();
  if (!state) {
    return NextResponse.json({ error: "State is required." }, { status: 400 });
  }

  const forceRefresh = isTruthy(forceRefreshRaw);

  const now = new Date();
  const startWindow = toDateOnly(now);
  const endWindow = toDateOnly(addMonths(now, 6));

  const sql = getSql();
  const dbUrlPresent = dbEnvPresent();
  let dbReadError: string | null = null;
  let dbWriteError: string | null = null;
  let dbInitError: string | null = null;

  if (!sql && dbUrlPresent) {
    dbInitError = "DB client failed to initialize (check DATABASE_URL/SSL settings).";
  }

  if (sql && !forceRefresh) {
    try {
      const { events, fetchedAt } = await readEventsFromDb({
        sql,
        state,
        startWindow,
        endWindow,
        limit: 200,
      });

      if (events.length) {
        return NextResponse.json(
          {
            state,
            fetchedAt,
            events,
            ...(process.env.NODE_ENV !== "production"
              ? {
                  debug: {
                    source: "db",
                    forceRefresh,
                    returned: events.length,
                    ...(dbInitError ? { dbInitError } : {}),
                  },
                }
              : {}),
          },
          { headers: { "cache-control": "no-store" } },
        );
      }
    } catch (err: unknown) {
      dbReadError = err instanceof Error ? err.message : String(err);
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

  try {
    const exaRes = await fetchEventsFromExa({ apiKey, state });
    const startCutoff = startWindow;
    const endCutoff = endWindow;
    const events = exaRes.eventsRaw
      .filter((e) => e.name && e.sourceUrl && /^\d{4}-\d{2}-\d{2}$/.test(e.startDate))
      .filter((e) => e.startDate >= startCutoff && e.startDate <= endCutoff)
      .sort((a, b) => a.startDate.localeCompare(b.startDate));

    if (sql) {
      try {
        await upsertEventsToDb({ sql, state, events });
      } catch (err: unknown) {
        dbWriteError = err instanceof Error ? err.message : String(err);
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
                source: "exa",
                query: exaRes.query,
                searchResults: exaRes.searchResults,
                extracted: exaRes.extracted,
                kept: events.length,
                forceRefresh,
                ...(dbInitError ? { dbInitError } : {}),
                ...(dbReadError ? { dbReadError } : {}),
                ...(dbWriteError ? { dbWriteError } : {}),
              },
            }
          : {}),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error: "Exa request failed.",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
}

