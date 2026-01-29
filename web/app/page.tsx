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

  return (
    <main style={{ maxWidth: 900, margin: "32px auto", padding: 16 }}>
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

      <ol style={{ marginTop: 16, paddingLeft: 18, display: "grid", gap: 12 }}>
        {events.map((e, idx) => (
          <li key={`${e.sourceUrl}-${idx}`}>
            <div style={{ fontWeight: 600 }}>{e.name}</div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>
              <span>{formatDateRange(e)}</span> · <span>{e.location}</span> ·{" "}
              <span>{e.targetAudience}</span>
            </div>
            <div style={{ marginTop: 6, fontSize: 13 }}>{e.summary}</div>
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
              <a href={e.sourceUrl} target="_blank" rel="noreferrer">
                Source
              </a>
            </div>
          </li>
        ))}
      </ol>
    </main>
  );
}
