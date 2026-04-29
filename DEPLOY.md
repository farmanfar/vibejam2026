# Deploying The Hired Swords

This game can be hosted as a static site. The only shared online backend in this repo is Supabase for:

- anonymous sign-in
- ghost snapshot matchmaking
- hall of fame / leaderboard

## Recommended path

For a small friend group, the easiest safe path is:

1. Build locally on the machine that already has the art assets.
2. Stage a release bundle with `npm run release:stage`.
3. Upload the staged `site/` folder to a static host.

This repo intentionally ignores paid art assets in Git. Because of that, Git-based cloud builds are not the reliable default. A local build upload is the safest option.

## One-time setup

1. Keep a local `.env` with:
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
2. In Supabase, enable anonymous auth.
3. Run the SQL in [supabase-setup.sql](/c:/Users/bigto/Documents/GitHub/hired-swords/supabase-setup.sql) if you have not already created the tables and policies.
   This creates three tables: `ghost_snapshots`, `hall_of_fame`, and `player_progress` (achievements + lifetime stats).

You can copy `.env.example` to `.env` and fill in your values.

## Build and stage a shareable bundle

From the repo root:

```powershell
npm run build
npm run release:stage
```

Those commands:

- runs `vite build`
- creates `artifacts/release/<timestamp>/site`
- copies the production site there
- copies a sample Caddy config there

## Fastest hosting options

### Option A: Direct upload static hosting

Use a provider that accepts prebuilt site uploads. Upload the staged `site/` folder from `artifacts/release/<timestamp>/site`.

This is the best fit for this repo because the assets are built locally first.

### Option B: Your existing server

Upload the staged `site/` folder to your server and serve it as plain static files over HTTPS.

If your server uses Caddy, start from [deploy/Caddyfile.example](/c:/Users/bigto/Documents/GitHub/hired-swords/deploy/Caddyfile.example).

## Verification checklist

After deployment, verify:

- the site loads over `https://`
- opening DevTools shows no missing asset 404s
- a run can enter battle and fetch an opponent
- the hall of fame screen can load

If ghost matchmaking fails, the game should still fall back to AI opponents, but the shared online features will be offline.
