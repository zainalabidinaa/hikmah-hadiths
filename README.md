# hikmah-hadiths

Supabase schema and import pipeline for a unified hadith backend.

It supports two source families in the same database:

- `thaqalayn_api`: JSON exported in `MohammedArab1/ThaqalaynAPI/V2/ThaqalaynData`
- `hikmah_offline`: nested offline JSON files from the Hikmah iOS app's `Resources/Hadith` directory

The importer keeps the two sources side by side instead of trying to merge them destructively. That means duplicate works such as `Al-Kafi` can exist from both sources with different `source_name` / `source_book_id` values.

## What This Repo Contains

- `supabase/migrations/20260417_initial_schema.sql`
  Public schema, read-only RLS policies, and SQL functions for fetching nested book/volume payloads.
- `src/import.ts`
  CLI importer.
- `src/sources/*.ts`
  Source adapters for ThaqalaynAPI and Hikmah offline JSON.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

3. Apply the SQL migration in Supabase:

- open `supabase/migrations/20260417_initial_schema.sql`
- paste it into the Supabase SQL editor and run it

4. Choose source locations:

- Local checkout paths:
  - `THAQALAYN_DATA_PATH`
  - `HIKMAH_HADITH_PATH`
- Or GitHub raw base URLs:
  - `THAQALAYN_DATA_BASE_URL`
  - `HIKMAH_HADITH_BASE_URL`

The importer prefers local paths when both are present.

## Import Commands

Import both source families:

```bash
npm run import:all
```

Import only ThaqalaynAPI data:

```bash
npm run import:thaqalayn
```

Import only Hikmah offline JSON:

```bash
npm run import:app-offline
```

## Runtime Read API

After the SQL migration, these functions are available from Supabase:

- `get_books_catalog(source_filter text default null)`
- `get_book_overview(book_slug text)`
- `get_book_volume(book_slug text, volume_number integer)`

Examples:

- all books:
  - `rpc/get_books_catalog`
- one book shell:
  - `rpc/get_book_overview` with `{ "book_slug": "hikmah-offline-alkafi" }`
- one volume payload:
  - `rpc/get_book_volume` with `{ "book_slug": "hikmah-offline-alkafi", "volume_number": 1 }`

## Notes

- The importer clears existing rows for the source being imported, then re-inserts that source cleanly.
- `service_role` is required for imports and must stay server-side.
- `anon` access is read-only through RLS policies defined in the SQL migration.
