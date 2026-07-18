import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

// pg's default DATE parser (OID 1082) builds a JS Date at local-midnight in
// the server's timezone, which JSON.stringify then re-renders in UTC — a
// calendar date like "2026-06-18" can silently become "2026-06-17T19:00:00Z"
// depending on the server's TZ, and shift again when a client formats it in
// *its* timezone. document_date is a pure calendar date with no time
// component to begin with, so skip the Date round-trip and hand it to the
// API layer as the plain "YYYY-MM-DD" string Postgres returned.
pg.types.setTypeParser(1082, (value) => value);

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("neon.tech")
    ? { rejectUnauthorized: false }
    : false,
});

export default pool;
