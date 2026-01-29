import postgres, { type Sql } from "postgres";

declare global {
  var __exaAppletSql: Sql | undefined;
  var __exaAppletSqlInit: Promise<void> | undefined;
}

function getDatabaseUrl(): string {
  // Support common Postgres env var names (Vercel/Neon/etc).
  return (
    // Prefer non-pooling URLs when available (more reliable for local dev).
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    ""
  );
}

export function getSql(): Sql | null {
  const url = getDatabaseUrl();
  if (!url) return null;

  if (!globalThis.__exaAppletSql) {
    try {
      globalThis.__exaAppletSql = postgres(url, {
        // Serverless-friendly defaults.
        max: 1,
        idle_timeout: 20,
        connect_timeout: 10,
        // Neon/Vercel Postgres generally requires SSL; this form is supported by postgres.js.
        ssl: { rejectUnauthorized: false },
        // Required for pgBouncer/Neon pooler; prevents ECONNRESET and protocol issues.
        prepare: false,
      });
    } catch {
      return null;
    }
  }

  return globalThis.__exaAppletSql;
}

export async function ensureEventsTable(sql: Sql): Promise<void> {
  if (!globalThis.__exaAppletSqlInit) {
    globalThis.__exaAppletSqlInit = (async () => {
      await sql/* sql */ `
        CREATE TABLE IF NOT EXISTS events (
          state TEXT NOT NULL,
          source_url TEXT NOT NULL,
          name TEXT NOT NULL,
          start_date DATE NOT NULL,
          end_date DATE,
          location TEXT NOT NULL,
          target_audience TEXT NOT NULL,
          summary TEXT NOT NULL,
          image_url TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (state, source_url)
        );
      `;
      await sql/* sql */ `
        CREATE INDEX IF NOT EXISTS events_state_start_idx ON events (state, start_date);
      `;
      await sql/* sql */ `
        CREATE INDEX IF NOT EXISTS events_last_seen_idx ON events (last_seen_at);
      `;
    })();
  }

  await globalThis.__exaAppletSqlInit;
}

