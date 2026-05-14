# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
cd backend && npm install

# Start dev server (nodemon, auto-reload)
npm run dev

# Start production server
npm start

# Initialize database (first-time setup or reset)
npm run init-db
```

Server runs on `PORT` from `.env` (default 3000). Frontend is served as static files from `frontend/` with SPA fallback for all non-API routes.

## Quick validation

- JS syntax: `node -c <file.js>`
- CSS brace balance: `node -e "const c=require('fs').readFileSync('<path>','utf8');console.log((c.match(/\{/g)||[]).length,'vs',(c.match(/\}/g)||[]).length)"`
- After CSS/JS edits, user must hard-refresh (Ctrl+Shift+R) — static serve still hits browser cache.

## Environment Setup

Copy `backend/.env.example` to `backend/.env` and fill in:
- `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` — MySQL connection
- `JWT_SECRET` — token signing secret
- `ADMIN_USERNAME`, `ADMIN_PASSWORD` — seeded admin account

`npm run init-db` loads `database/schema.sql`, seeds the admin user, and creates Season 1.

## Architecture

**Stack:** Node.js/Express backend, MySQL (mysql2/promise), vanilla JS frontend (no build step).

**Backend entry:** `backend/server.js` — mounts all routes, serves static frontend.

**Frontend:** Single HTML file (`frontend/index.html`) with page sections toggled by JS. `frontend/js/api.js` handles all HTTP calls with JWT Bearer auth from localStorage. `frontend/js/app.js` contains rank display logic, page routing, and shared utilities.

### Rating System

Two algorithms coexist:
- **ELO** (`backend/utils/elo.js`) — primary, K-factor configurable per season, rank tier/score gap multipliers
- **TrueSkill2** (`backend/utils/trueskill.js`) — mu/sigma model, converts mu to ELO equivalent

Four rating modes tracked independently per player per season: `attack`, `defense`, `duo` (2v2 fixed partner), `1v1`.

Match flow: frontend POSTs to `/api/matches` → backend fetches `player_ratings` (creates row if missing) → calculates ELO deltas with season multipliers + streaks → updates `player_ratings` + inserts `elo_history` snapshot.

### Season Multipliers

`seasons` table stores all tunable parameters: `base_k_factor`, `rank_multiplier`, `score_multiplier`, `duo_rank_multiplier`, `mate_rank_multiplier`, `loss_multiplier`, `win_streak_multiplier`, `loss_streak_multiplier`, `winrate_multiplier`. Also `algorithm` (`'elo'`|`'trueskill2'`) and TrueSkill params (`ts_mu`, `ts_sigma`, `ts_beta`, `ts_tau`, `ts_scale`, `ts_score_multiplier`). Every calculation reads these from the active season.

TrueSkill stores per-player per-role mu/sigma in `player_ratings` columns: `ts_mu_attack`, `ts_sigma_attack`, `ts_mu_defense`, `ts_sigma_defense`, `ts_mu_duo`, `ts_sigma_duo`, `ts_mu_1v1`, `ts_sigma_1v1`. Displayed ELO = `round(mu * ts_scale)`.

### Schema Migrations

`backend/config/ensure-schema.js` runs on server start to apply column changes (precision widening, new columns) without recreating tables. Add migration logic there for schema changes rather than modifying `schema.sql` alone.

### Season Transitions

Activating a season (`PUT /api/seasons/:id/activate`) does **full carryover**: ELO + mu/sigma copy from previous active season into the new season's `player_ratings` rows. Wins/losses/streaks reset to 0. Recaps for the outgoing season are generated in the same transaction. Don't reset ELO unless the user explicitly asks. Algorithm multipliers (winrate, streaks) read from the current `player_ratings` row, so they are already current-season-scoped.

### Recaps (Spotify-Wrapped style)

`backend/utils/seasonRecap.js` generates two JSON blobs per ended season: global (`season_recaps` table — total matches + top 3 each ranking) and per-player (`player_season_recaps` — V/L, winrate, ELO delta, longest streak, most-beaten / nemesis / best teammate, mode breakdown). Frontend auto-pops a slide modal at first login post-rollover (checked by `viewed_at IS NULL`), replayable from Profile.

### Skins

`skin_titles` (label + color), `skin_borders` (label + uploaded image), `player_skins` (ownership). Equipped pointers live on `players.equipped_title_id` / `equipped_border_id`. Borders uploaded by admins via multer to `frontend/uploads/borders/`. Players equip from Profile; admins manage in Admin tab.

### Theme

Global theme (`'classic'` | `'mai'`) stored in `app_settings` table. `ALLOWED_THEMES` enforced in `backend/routes/settings.js` AND `frontend/js/app.js`. Frontend applies via `<body data-theme="...">`. Classic = LoL gold base; Mai = emerald premium override layer at end of `style.css` scoped to `body[data-theme="mai"]` (variable remap + glass/glow). Recap modal forces classic purple palette even under `mai` (variable re-remap + `!important` inside `.recap-*` selectors).

### Numeric form fields (gotcha)

`parseFloat("")` returns `NaN`, and `??` does NOT catch NaN. Use `safeNum(value, fallback)` in `backend/routes/seasons.js` for any `DECIMAL` column accepting frontend input — otherwise MySQL throws "Incorrect decimal value" and the admin save button looks broken.

### TrueSkill2 calibration

Defaults (`backend/utils/trueskill.js` `getTsConfig`, `backend/routes/seasons.js` `TS_DEFAULTS`, `backend/config/ensure-schema.js` column DEFAULTs) are calibrated for **~80 ELO points per match win, ±10 points per 400 ELO gap** between players. Key params: `ts_beta=86/3≈28.667` (high performance noise = gap-insensitive), `ts_scale=61`, `ts_score_multiplier=0`. `ensure-schema.js` migrates existing seasons matching old defaults; customized seasons preserved.

### Admin "live" form pickers

Admin form pickers that should persist on click (not on parent Save) must `await api(PUT)` inside their click handler and update local `data-*` state from `res.X` (server-confirmed value). Example: `pickAlgo` in `app.js` calls `PUT /seasons/:id/algorithm` immediately. Without this, F5 reverts because parent form was never submitted.

### Uploads

Multer disk storage, files land in `frontend/uploads/<kind>/` (e.g. `avatars`, `borders`). Pattern: mime-to-ext fallback for iOS HEIC/blob filenames. Resize/JPEG conversion done client-side before upload (`resizeImageToBlob` in app.js).

### Route conventions

Newer routes (`recaps.js`, `skins.js`, `settings.js`) wrap handlers in a local `asyncRoute(fn)` helper that does `Promise.resolve(fn).catch(500)`. Older routes use explicit `try/catch`. Don't mix styles within a single file **except** when a handler uses an explicit `pool.getConnection()` transaction — those need `try/catch/finally` for `conn.rollback()` + `conn.release()` and can coexist with `asyncRoute` siblings.

### Inline handlers

Frontend uses inline `onclick=`/`oninput=` on rendered HTML — globally-named functions in `app.js` are part of the public surface. Don't rename them without grepping HTML strings.

### Tournaments

Single/double elimination brackets. `tournament_matches` stores bracket nodes (round + position). Byes are handled for non-power-of-2 participant counts. Results link back to `matches` table entries.

### Authentication

JWT tokens carry `{ id, identifier, is_admin }`. `backend/middleware/auth.js` exports `authenticateToken` and `requireAdmin`. Admin-only routes use both middlewares.

## Key Files

| File | Purpose |
|------|---------|
| `database/schema.sql` | Authoritative schema — 10 tables |
| `backend/config/db.js` | MySQL connection pool |
| `backend/config/ensure-schema.js` | Runtime schema migrations |
| `backend/utils/elo.js` | ELO formulas, rank tiers (Iron→Challenger), divisions |
| `backend/utils/trueskill.js` | TrueSkill2 implementation |
| `backend/utils/streaks.js` | Streak multiplier logic |
| `backend/utils/seasonRecap.js` | Generates global + per-player season recaps |
| `backend/routes/recaps.js` | Recap endpoints (player + global) |
| `backend/routes/skins.js` | Titles + borders CRUD, grant/revoke, equip |
