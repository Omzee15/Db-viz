import { NextRequest, NextResponse } from "next/server";
import { Client } from "pg";

export const runtime = "nodejs";

interface ColumnRow {
  table_name: string;
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: string;
  column_default: string | null;
}

interface PrimaryKeyRow {
  table_name: string;
  column_name: string;
}

interface ForeignKeyRow {
  table_name: string;
  column_name: string;
  foreign_table_name: string;
  foreign_column_name: string;
  constraint_name: string;
}

interface UniqueRow {
  table_name: string;
  column_name: string;
}

function resolveType(row: ColumnRow): string {
  const dt = row.data_type.toLowerCase();
  if (dt === "array") return `${row.udt_name.replace(/^_/, "")}[]`;
  if (dt === "user-defined") return row.udt_name;
  // Types with spaces (e.g. "character varying", "timestamp without time zone")
  // are not valid bare DBML tokens — use udt_name which is always a single word.
  if (row.data_type.includes(" ")) return row.udt_name;
  return row.data_type;
}

function buildDbml(
  columns: ColumnRow[],
  primaryKeys: PrimaryKeyRow[],
  foreignKeys: ForeignKeyRow[],
  uniqueKeys: UniqueRow[]
): string {
  // Group columns by table
  const tableMap = new Map<string, ColumnRow[]>();
  for (const col of columns) {
    if (!tableMap.has(col.table_name)) tableMap.set(col.table_name, []);
    tableMap.get(col.table_name)!.push(col);
  }

  const pkSet = new Set(primaryKeys.map((r) => `${r.table_name}.${r.column_name}`));
  const uniqueSet = new Set(uniqueKeys.map((r) => `${r.table_name}.${r.column_name}`));

  const lines: string[] = [];

  for (const [tableName, cols] of tableMap.entries()) {
    lines.push(`Table "${tableName}" {`);
    for (const col of cols) {
      const key = `${tableName}.${col.column_name}`;
      const notes: string[] = [];
      if (pkSet.has(key)) notes.push("pk");
      if (col.is_nullable === "NO" && !pkSet.has(key)) notes.push("not null");
      if (uniqueSet.has(key) && !pkSet.has(key)) notes.push("unique");
      // Skip Postgres-specific defaults (function calls, casts with ::) — they break DBML parsing
      if (col.column_default !== null && !col.column_default.includes("(") && !col.column_default.includes("::")) {
        const escaped = col.column_default.replace(/"/g, '\\"');
        notes.push(`default: "${escaped}"`);
      }
      const notesStr = notes.length > 0 ? ` [${notes.join(", ")}]` : "";
      lines.push(`  "${col.column_name}" ${resolveType(col)}${notesStr}`);
    }
    lines.push("}");
    lines.push("");
  }

  // Refs — use unquoted table.column notation in Refs.
  // In DBML, "table"."col" is interpreted as schema.table (schema-qualified),
  // so we must NOT quote the identifiers inside Ref statements.
  const seenRefs = new Set<string>();

  let effectiveFKs = foreignKeys;

  // If no real FK constraints exist, infer them from column naming conventions.
  // Match columns named `<x>_id` or `<x>id` against known table names: if a table
  // named <x> exists in the schema and has a column called `id`, add a virtual ref.
  if (foreignKeys.length === 0 && columns.length > 0) {
    const tableNames = new Set(columns.map((c) => c.table_name));
    // Tables that have an `id` column (the likely pk target)
    const tablesWithId = new Set(
      columns.filter((c) => c.column_name === "id").map((c) => c.table_name)
    );

    const inferred: ForeignKeyRow[] = [];
    for (const col of columns) {
      const lower = col.column_name.toLowerCase();
      // Match `<x>_id` (preferred) or `<x>id`
      let candidate: string | null = null;
      if (lower.endsWith("_id")) {
        candidate = lower.slice(0, -3); // strip `_id`
      } else if (lower.endsWith("id") && lower.length > 2) {
        candidate = lower.slice(0, -2); // strip `id`
      }
      if (!candidate) continue;

      // Direct match: candidate == table name
      if (tableNames.has(candidate) && tablesWithId.has(candidate)) {
        inferred.push({
          table_name: col.table_name,
          column_name: col.column_name,
          foreign_table_name: candidate,
          foreign_column_name: "id",
          constraint_name: `inferred_${col.table_name}_${col.column_name}`,
        });
        continue;
      }
      // Try singular/plural variants: strip trailing `s`, or add `s`
      const singular = candidate.endsWith("s") ? candidate.slice(0, -1) : null;
      const plural = candidate + "s";
      const match = [singular, plural].find(
        (v) => v && tableNames.has(v) && tablesWithId.has(v)
      );
      if (match) {
        inferred.push({
          table_name: col.table_name,
          column_name: col.column_name,
          foreign_table_name: match,
          foreign_column_name: "id",
          constraint_name: `inferred_${col.table_name}_${col.column_name}`,
        });
      }
    }
    effectiveFKs = inferred;
  }

  for (const fk of effectiveFKs) {
    // Skip self-referencing (table points to itself)
    if (fk.table_name === fk.foreign_table_name) continue;
    const refKey = `${fk.table_name}.${fk.column_name}>${fk.foreign_table_name}.${fk.foreign_column_name}`;
    if (seenRefs.has(refKey)) continue;
    seenRefs.add(refKey);
    lines.push(
      `Ref: ${fk.table_name}.${fk.column_name} > ${fk.foreign_table_name}.${fk.foreign_column_name}`
    );
  }

  return lines.join("\n").trim();
}

export async function POST(req: NextRequest) {
  let connectionString: string;
  try {
    const body = await req.json();
    connectionString = body?.connectionString?.trim();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!connectionString) {
    return NextResponse.json({ error: "connectionString is required" }, { status: 400 });
  }

  // Basic validation: must start with postgres:// or postgresql://
  if (!/^postgres(ql)?:\/\//i.test(connectionString)) {
    return NextResponse.json(
      { error: "Connection string must be a valid PostgreSQL URI (postgres:// or postgresql://)" },
      { status: 400 }
    );
  }

  const client = new Client({ connectionString, connectionTimeoutMillis: 10000 });

  try {
    await client.connect();

    const schemaFilter = `AND table_schema NOT IN ('pg_catalog','information_schema','pg_toast')`;

    const [columnsResult, pkResult, uniqueResult] = await Promise.all([
      client.query<ColumnRow>(`
        SELECT table_name, column_name, data_type, udt_name,
               is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' ${schemaFilter}
        ORDER BY table_name, ordinal_position
      `),
      client.query<PrimaryKeyRow>(`
        SELECT kcu.table_name, kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_schema = 'public'
      `),
      client.query<UniqueRow>(`
        SELECT kcu.table_name, kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'UNIQUE'
          AND tc.table_schema = 'public'
      `),
    ]);

    // Run FK query separately — use unnest WITH ORDINALITY to correctly match
    // each FK column to its referenced column by ordinal position.
    let fkRows: ForeignKeyRow[] = [];
    let fkError: string | null = null;
    let fkRawCount = 0;
    try {
      const fkResult = await client.query<ForeignKeyRow>(`
        SELECT
          src.relname::text    AS table_name,
          srcatt.attname::text AS column_name,
          dst.relname::text    AS foreign_table_name,
          dstatt.attname::text AS foreign_column_name,
          con.conname::text    AS constraint_name
        FROM pg_catalog.pg_constraint con
        JOIN pg_catalog.pg_class src ON src.oid = con.conrelid
        JOIN pg_catalog.pg_class dst ON dst.oid = con.confrelid
        JOIN pg_catalog.pg_namespace ns ON ns.oid = src.relnamespace
        JOIN LATERAL unnest(con.conkey)  WITH ORDINALITY AS src_col(attnum, ord) ON true
        JOIN LATERAL unnest(con.confkey) WITH ORDINALITY AS dst_col(attnum, ord) ON src_col.ord = dst_col.ord
        JOIN pg_catalog.pg_attribute srcatt
          ON srcatt.attrelid = con.conrelid  AND srcatt.attnum = src_col.attnum
        JOIN pg_catalog.pg_attribute dstatt
          ON dstatt.attrelid = con.confrelid AND dstatt.attnum = dst_col.attnum
        WHERE con.contype = 'f'
          AND ns.nspname = 'public'
      `);
      fkRows = fkResult.rows;
      fkRawCount = fkRows.length;
    } catch (pgCatalogErr) {
      // Fallback: information_schema
      try {
        const fkResult = await client.query<ForeignKeyRow>(`
          SELECT
            kcu.table_name::text           AS table_name,
            kcu.column_name::text          AS column_name,
            ccu.table_name::text           AS foreign_table_name,
            ccu.column_name::text          AS foreign_column_name,
            tc.constraint_name::text       AS constraint_name
          FROM information_schema.table_constraints AS tc
          JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema = tc.table_schema
          WHERE tc.constraint_type = 'FOREIGN KEY'
            AND tc.table_schema = 'public'
        `);
        fkRows = fkResult.rows;
        fkRawCount = fkRows.length;
      } catch (fallbackErr) {
        fkError = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
        console.error('FK query (both attempts) failed:', pgCatalogErr, fallbackErr);
      }
    }

    await client.end();

    if (columnsResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'No tables found in the public schema of this database' },
        { status: 404 }
      );
    }

    const dbml = buildDbml(
      columnsResult.rows,
      pkResult.rows,
      fkRows,
      uniqueResult.rows
    );

    const tableCount = new Set(columnsResult.rows.map((r) => r.table_name)).size;
    const fkCount = new Set(fkRows.map((r) => r.constraint_name)).size;

    return NextResponse.json({ dbml, tableCount, fkCount, fkRawCount, fkError });
  } catch (err: unknown) {
    try { await client.end(); } catch { /* ignore */ }

    const message = err instanceof Error ? err.message : String(err);
    // Sanitize connection string from error messages to avoid leaking credentials
    const safe = message.replace(/postgresql?:\/\/[^@]+@/gi, "postgresql://<redacted>@");
    return NextResponse.json({ error: `Connection failed: ${safe}` }, { status: 500 });
  }
}
