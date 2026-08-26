# AstraChat Website

A single-page landing + account site that shares your Supabase project with the app.

## What it does
- **Login / signup** via Supabase Auth — the exact same users as the Android app.
- **Buy Astra+** (Plus $5 / Pro $10) through Stripe Checkout, tied to the logged-in user.
  The deployed `stripe-webhook` function already flips `subscriptions.tier`, so buying
  on the web unlocks the app instantly (and vice versa).
- **Download** button auto-syncs with your update manifest
  (`Uipate/main/update-manifest.json`) — new release on GitHub = new link on the site.
- Live character count straight from the database.
- Tier badge in the nav after sign-in (`web-account` function).

## Run locally
```powershell
python -m http.server 4173 --directory D:\AstraChat\website
# open http://localhost:4173
```

## Deploy to GitHub Pages (free)
1. Create repo `tomamateimihaii/astra-site` (public).
2. Copy everything inside this `website/` folder to the repo root.
3. Repo → Settings → Pages → Source: `main` branch, `/ (root)` → Save.
4. Your site: `https://tomamateimihaii.github.io/astra-site/`

Optional custom domain later: add `CNAME` file + DNS record; no code changes needed.

## Going live with payments
Follow `docs/stripe-setup.md`. Once you send me the four values
(`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PLUS`, `STRIPE_PRICE_PRO`),
the Buy buttons switch from "payments go live soon" to real Stripe Checkout sessions
tied to each user's Supabase ID — nothing on the site needs to change.

## Files
| File | Purpose |
|---|---|
| `index.html` | Landing page markup (hero, features, pricing, download, FAQ, auth modal) |
| `styles.css` | Design tokens matching the app (black / #3B82F6 / Outfit) |
| `app.js` | Supabase auth, checkout calls, manifest + stats loading |

## Edge functions used
| Function | Role |
|---|---|
| `web-checkout` | Creates a Stripe Checkout session for the signed-in user (returns `{configured:false}` until Stripe keys are set) |
| `web-account` | Returns the caller's tier/username for the nav badge |
| `stripe-webhook` | Already live — maps price → tier → subscriptions table |
