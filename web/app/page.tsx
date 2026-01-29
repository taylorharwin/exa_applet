"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { EventItem, EventsResponse } from "@/app/lib/types";

function formatDateRange(e: EventItem): string {
  return e.endDate && e.endDate !== e.startDate ? `${e.startDate} → ${e.endDate}` : e.startDate;
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

const US_STATES: Array<{ code: string; name: string }> = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
];

export default function Home() {
  const [stateInput, setStateInput] = useState("CA");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<EventsResponse | null>(null);

  const didInitialFetchRef = useRef(false);

  const stateTrimmed = useMemo(() => stateInput.trim(), [stateInput]);

  async function refreshNow(opts?: { forceRefresh?: boolean }) {
    const state = stateTrimmed;
    if (!state) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          state,
          forceRefresh: Boolean(opts?.forceRefresh),
        }),
      });
      const json = (await res.json()) as any;
      if (!res.ok) {
        throw new Error(json?.error || `Request failed (${res.status})`);
      }
      setData(json as EventsResponse);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Fetch once on initial load (shows cached results if available).
    // Guard against React strict mode double-invoking effects in dev.
    if (didInitialFetchRef.current) return;
    didInitialFetchRef.current = true;
    if (!stateTrimmed) return;
    refreshNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const events = data?.events ?? [];

  return (
    <main className="app">
      <section className="card" style={{ padding: 16 }}>
        <div className="header">
          <div>
            <h1 className="title">Exa Event Finder</h1>
            <p className="subtitle">
              Book fairs, comic cons, and related conventions in your state (next 6 months).
            </p>
          </div>
        </div>

        <div className="controls">
          <label className="label">
            <span>State</span>
            <select
              className="input"
              value={stateInput}
              onChange={(e) => setStateInput(e.target.value)}
              aria-label="State"
            >
              {US_STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.code} — {s.name}
                </option>
              ))}
            </select>
          </label>

          <button
            onClick={() => refreshNow({ forceRefresh: true })}
            disabled={!stateTrimmed || loading}
            className="btn btnPrimary"
          >
            {loading ? "Refreshing…" : "Refresh now"}
          </button>
        </div>

      {error ? (
        <div className="error">{error}</div>
      ) : data ? (
        <div className="statusLine">
          Fetched {fmtDateTime(data.fetchedAt)} for <b>{data.state}</b>. {events.length} events.
          {data.debug && typeof data.debug === "object" ? (
            <div style={{ marginTop: 6 }}>
              Debug:{" "}
              {Object.entries(data.debug as Record<string, unknown>)
                .slice(0, 6)
                .map(([k, v]) => `${k}=${String(v)}`)
                .join(" · ")}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="statusLine">
          Enter a state and press <b>Refresh now</b>.
        </div>
      )}

        <div className="cardsGrid">
          {events.length ? (
            events.map((e, idx) => (
              <a
                key={`${e.sourceUrl}-${idx}`}
                className="eventCard"
                href={e.sourceUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open ${e.name}`}
              >
                <div className="eventCardHeader">
                  <div className="eventCardTitle">{e.name}</div>
                  <div className="eventCardDate">{formatDateRange(e)}</div>
                </div>

                {e.imageUrl ? (
                  <div className="eventCardImageWrap">
                    <img
                      className="eventCardImage"
                      src={e.imageUrl}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                ) : null}

                <div className="eventCardBody">
                  <div className="eventCardSummary">{e.summary}</div>
                  <div className="eventCardMeta">{e.location}</div>
                </div>
              </a>
            ))
          ) : (
            <div className="statusLine" style={{ marginTop: 0 }}>
              No events yet. Enter a state and press <b>Refresh now</b>.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
