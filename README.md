# Dentistry PQ Dashboard

Static GitHub Pages dashboard for House of Commons written parliamentary questions to the Department of Health and Social Care matching `dent*`.

The browser app reads committed JSON from `data/` only. It does not call the UK Parliament API at runtime.

## Data

Questions are fetched from the UK Parliament Written Questions API:

- `house=Commons`
- `answeringBodies=17`
- `answered=Any`
- `includeWithdrawn=false`
- `expandMember=true`
- `searchTerm=dent*`

Constituency-to-region mapping is generated from the mySociety 2025 constituency dataset and bucketed into NHS England regions, with Scotland, Wales, and Northern Ireland kept as separate buckets.

## Refresh Locally

```sh
node scripts/refresh-data.mjs
```

This updates:

- `data/questions.json`
- `data/summary.json`
- `data/constituency-regions.json`

## Deployment

The site is designed for GitHub Pages from `main` / root. The scheduled workflow refreshes data on weekday mornings and commits only when the generated JSON changes.
