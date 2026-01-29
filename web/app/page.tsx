"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { EventItem, EventsResponse } from "@/app/lib/types";

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

function formatDateRange(e: EventItem): string {
  return e.endDate && e.endDate !== e.startDate ? `${e.startDate} → ${e.endDate}` : e.startDate;
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export default function Home() {
  const [stateInput, setStateInput] = useState("CA");
  const [aboutYou, setAboutYou] = useState("");
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<EventsResponse | null>(null);

  const timerRef = useRef<number | null>(null);

  const stateTrimmed = useMemo(() => stateInput.trim(), [stateInput]);

  async function refreshNow() {
    const state = stateTrimmed;
    if (!state) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state, userProfile: aboutYou.trim() }),
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

  function clearTimer() {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function scheduleNext() {
    clearTimer();
    if (!autoRefreshEnabled) return;
    if (!stateTrimmed) return;
    if (document.visibilityState !== "visible") return;

    timerRef.current = window.setTimeout(() => {
      refreshNow();
    }, TWO_DAYS_MS);
  }

  useEffect(() => {
    scheduleNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefreshEnabled, stateTrimmed]);

  useEffect(() => {
    function onVis() {
      scheduleNext();
    }
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      clearTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefreshEnabled, stateTrimmed]);

  const events = data?.events ?? [];

  function openEvent(url: string) {
    // Keep consistent with the "Event Name" link behavior: open in a new tab.
    window.open(url, "_blank", "noopener,noreferrer");
  }

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
          <input
            className="input"
            value={stateInput}
            onChange={(e) => setStateInput(e.target.value)}
            placeholder="e.g. CA or California"
          />
          </label>

          <button onClick={() => refreshNow()} disabled={!stateTrimmed || loading} className="btn btnPrimary">
            {loading ? "Refreshing…" : "Refresh now"}
          </button>

          <label className="label" style={{ textTransform: "none", letterSpacing: "normal" }}>
          <input
            type="checkbox"
            checked={autoRefreshEnabled}
            onChange={(e) => setAutoRefreshEnabled(e.target.checked)}
          />
            <span style={{ color: "var(--muted)", fontWeight: 700 }}>
              Auto-refresh (every 2 days, while open)
            </span>
          </label>
        </div>

        <div style={{ marginTop: 14 }}>
          <div className="label" style={{ marginBottom: 8 }}>
            About you (for relevance scoring)
          </div>
          <textarea
            className="textarea"
            value={aboutYou}
            onChange={(e) => setAboutYou(e.target.value)}
            placeholder='Example: "I have two kids under 10, love horror novels, prefer weekend events, and I’m in the Bay Area. I don’t like anime."'
          />
        </div>

      {error ? (
        <div className="error">{error}</div>
      ) : data ? (
        <div className="statusLine">
          Fetched {fmtDateTime(data.fetchedAt)} for <b>{data.state}</b>. {events.length} events.
          {data.debug ? (
            <div style={{ marginTop: 6 }}>
              Debug: {data.debug.searchResults} search results → {data.debug.extracted} extracted →{" "}
              {data.debug.kept} kept.
            </div>
          ) : null}
        </div>
      ) : (
        <div className="statusLine">
          Enter a state and press <b>Refresh now</b>.
        </div>
      )}

        <div className="tableWrap">
          <table className="eventsTable">
          <thead>
            <tr>
              <th scope="col" style={{ whiteSpace: "nowrap" }}>
                Date
              </th>
              <th scope="col">Event Name</th>
              <th scope="col">Address</th>
              <th scope="col" style={{ whiteSpace: "nowrap" }}>
                For me
              </th>
            </tr>
          </thead>
          <tbody>
            {events.length ? (
              events.map((e, idx) => (
                <tr
                  key={`${e.sourceUrl}-${idx}`}
                  className="eventsTableRowLink"
                  role="link"
                  tabIndex={0}
                  aria-label={`Open ${e.name}`}
                  onClick={() => openEvent(e.sourceUrl)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      openEvent(e.sourceUrl);
                    }
                  }}
                >
                  <td
                    style={{
                      whiteSpace: "nowrap",
                    }}
                  >
                    {formatDateRange(e)}
                  </td>
                  <td>
                    <a
                      href={e.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        textDecoration: "underline",
                        textUnderlineOffset: 3,
                        fontWeight: 900,
                      }}
                      title={e.summary}
                      onClick={(ev) => ev.stopPropagation()}
                    >
                      {e.name}
                    </a>
                  </td>
                  <td>{e.location}</td>
                  <td style={{ whiteSpace: "nowrap", fontWeight: 900 }}>
                    {typeof e.relevance === "number" ? `${e.relevance}/10` : "—"}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} style={{ padding: "12px 10px", color: "var(--muted)" }}>
                  No events yet. Enter a state and press <b>Refresh now</b>.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </section>
    </main>
  );
}
