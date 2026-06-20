import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Serverless-friendly settings: keep very few connections open and
  // recycle them quickly so we don't exhaust the DB's connection limit
  // across many short-lived function invocations.
  max: 5,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
});

// CRITICAL: node-postgres Pool emits an 'error' event whenever an idle
// client in the pool errors out (e.g. the DB/connection proxy terminates
// an idle connection — common with managed Postgres like Supabase/Neon).
// Without a listener here, that 'error' event is an *uncaught exception*
// that crashes the entire Node process. In a serverless function that
// surfaces to the user as a generic "FUNCTION_INVOCATION_FAILED" 500 —
// exactly the error seen when accepting invoice requests.
pool.on("error", (err) => {
  console.error("Unexpected error on idle Postgres client:", err);
});

export const db = drizzle(pool, { schema });
