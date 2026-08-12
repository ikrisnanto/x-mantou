# x-mantou.com

Interactive SpaceX P&L and balance-sheet model, plus a comment board with voting.
Deployed on Cloudflare Pages at [x-mantou.com](https://x-mantou.com).

## Where things live

```
src/dashboard/
  assumptions.js   <- EDIT THIS to change the model. Every figure lives here.
  dashboard.js        engine (quarterly P&L, balance sheet, financing) + charts + comments UI
  body.html           page markup
  styles.css          all styling, light + dark
build.js              assembles the four files above into one self-contained index.html
index.html            BUILD OUTPUT — do not edit by hand, it is overwritten
functions/api/        Cloudflare Pages Functions: comments + voting + admin delete
shared/security.js    IP hashing, per-IP rate limits, Turnstile verification
schema.sql            D1 tables
reference/            the original spreadsheet + generator script (not authoritative)
```

## Changing the model

1. Edit `src/dashboard/assumptions.js`.
2. `npm run build`
3. `npx wrangler pages deploy dist --project-name=x-mantou --commit-dirty=true`

Forecast arrays must keep exactly 10 entries (Q326 → Q428). Ratios are fractions,
money is $ millions per quarter unless the name says otherwise.

The output has to stay a single self-contained file — Pages serves it directly and
the published Artifact copy blocks external scripts — which is why `build.js`
concatenates rather than bundles.

## Backend

D1 database `x-mantou-comments`. Secrets are set per-project, and **Pages only picks
up a secret on the next deployment**, so always redeploy after changing one:

```bash
npx wrangler pages secret put ADMIN_TOKEN --project-name=x-mantou
npm run build && npx wrangler pages deploy dist --project-name=x-mantou
```

| Secret | Purpose |
|---|---|
| `ADMIN_TOKEN` | Unlocks comment deletion at `/#admin` |
| `TURNSTILE_SECRET` / `TURNSTILE_SITEKEY` | Bot check on comment posting |
| `RATE_SALT` | Salt for the hashed-IP rate limiter (raw IPs are never stored) |

Limits: 5 comments and 60 votes per IP per 10 minutes; 10 admin attempts per 10
minutes. Votes are keyed to a server-derived IP hash, not a client-supplied id.

## Deploying

`git push` triggers `.github/workflows/deploy.yml`, which needs repo secrets
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Deploying by hand with the
wrangler command above works regardless.
