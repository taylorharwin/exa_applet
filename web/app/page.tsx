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
        body: JSON.stringify({ state }),
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
    <main style={{ width: "100%", margin: "32px 0", padding: 16 }}>
      <h1 style={{ fontSize: 18, marginBottom: 8 }}>Exa Event Finder</h1>
      <p style={{ opacity: 0.8, marginBottom: 16 }}>
        Book fairs, comic cons, and related conventions in your state (next 6 months).
      </p>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, opacity: 0.8 }}>State</span>
          <input
            value={stateInput}
            onChange={(e) => setStateInput(e.target.value)}
            placeholder="e.g. CA or California"
            style={{
              padding: "8px 10px",
              border: "1px solid rgba(127,127,127,0.4)",
              borderRadius: 6,
              minWidth: 220,
            }}
          />
        </label>

        <button
          onClick={() => refreshNow()}
          disabled={!stateTrimmed || loading}
          style={{
            padding: "8px 12px",
            borderRadius: 6,
            border: "1px solid rgba(127,127,127,0.4)",
            background: loading ? "rgba(127,127,127,0.15)" : "transparent",
            cursor: loading ? "default" : "pointer",
          }}
        >
          {loading ? "Refreshing…" : "Refresh now"}
        </button>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={autoRefreshEnabled}
            onChange={(e) => setAutoRefreshEnabled(e.target.checked)}
          />
          <span style={{ fontSize: 12, opacity: 0.8 }}>Auto-refresh (every 2 days, while open)</span>
        </label>
      </div>

      {error ? (
        <div style={{ marginTop: 12, color: "crimson" }}>{error}</div>
      ) : data ? (
        <div style={{ marginTop: 12, fontSize: 12, opacity: 0.8 }}>
          Fetched {fmtDateTime(data.fetchedAt)} for <b>{data.state}</b>. {events.length} events.
        </div>
      ) : (
        <div style={{ marginTop: 12, fontSize: 12, opacity: 0.8 }}>
          Enter a state and press <b>Refresh now</b>.
        </div>
      )}

      <div style={{ marginTop: 16, overflowX: "auto" }}>
        <table className="eventsTable" style={{ borderCollapse: "collapse", minWidth: 720 }}>
          <thead>
            <tr>
              <th
                scope="col"
                style={{
                  textAlign: "left",
                  fontSize: 12,
                  opacity: 0.8,
                  padding: "10px 8px",
                  borderBottom: "1px solid rgba(127,127,127,0.35)",
                  whiteSpace: "nowrap",
                }}
              >
                Date
              </th>
              <th
                scope="col"
                style={{
                  textAlign: "left",
                  fontSize: 12,
                  opacity: 0.8,
                  padding: "10px 8px",
                  borderBottom: "1px solid rgba(127,127,127,0.35)",
                }}
              >
                Event Name
              </th>
              <th
                scope="col"
                style={{
                  textAlign: "left",
                  fontSize: 12,
                  opacity: 0.8,
                  padding: "10px 8px",
                  borderBottom: "1px solid rgba(127,127,127,0.35)",
                }}
              >
                Address
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
                      padding: "10px 8px",
                      borderBottom: "1px solid rgba(127,127,127,0.2)",
                      fontSize: 13,
                      whiteSpace: "nowrap",
                      verticalAlign: "top",
                    }}
                  >
                    {formatDateRange(e)}
                  </td>
                  <td
                    style={{
                      padding: "10px 8px",
                      borderBottom: "1px solid rgba(127,127,127,0.2)",
                      fontSize: 13,
                      verticalAlign: "top",
                    }}
                  >
                    <a
                      href={e.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ textDecoration: "underline", textUnderlineOffset: 2 }}
                      title={e.summary}
                      onClick={(ev) => ev.stopPropagation()}
                    >
                      {e.name}
                    </a>
                  </td>
                  <td
                    style={{
                      padding: "10px 8px",
                      borderBottom: "1px solid rgba(127,127,127,0.2)",
                      fontSize: 13,
                      verticalAlign: "top",
                    }}
                  >
                    {e.location}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3} style={{ padding: "12px 8px", fontSize: 13, opacity: 0.8 }}>
                  No events yet. Enter a state and press <b>Refresh now</b>.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
