# x-mantou.com

Interactive SpaceX P&L and balance-sheet model, plus a comment board with voting.
Deployed on Cloudflare Pages at [x-mantou.com](https://x-mantou.com).

## Where things live

```
src/dashboard/
  assumptions.js          <- EDIT THIS to change the model. Every figure lives here.
  dashboard.js               engine (quarterly P&L, balance sheet, financing) + charts + comments UI
  body.html                  page markup shared by both pages
  assumptions-card.html      the editor, emitted only into /admin
  styles.css                 all styling, light + dark
build.js                  assembles the above into dist/index.html and dist/admin/index.html
index.html                BUILD OUTPUT — do not edit by hand, it is overwritten
scripts/check.js          validates assumptions.js is internally consistent
scripts/roll-quarter.js   rolls the model forward when a quarter is reported
functions/admin/          gates /admin behind Cloudflare Access
functions/api/            comments, voting, moderation, published assumptions
shared/security.js        IP hashing, per-IP rate limits, Turnstile verification
shared/access.js          Cloudflare Access JWT verification
schema.sql                D1 tables
reference/                the original spreadsheet + generator script (not authoritative)
```

## Rolling the model forward

`assumptions.js` holds two lists: `REPORTED`, the published quarters oldest
first, and `Q`, the quarters still being forecast. The last entry in `REPORTED`
is the jump-off — the forecast starts from it, and its balance sheet and segment
detail seed the engine. Nothing else in the code hardcodes a quarter, so moving
the boundary is a data change.

When SpaceX reports a new quarter:

```bash
npm run roll-quarter -- --template            # writes new-quarter.json for the next quarter
# fill in the reported figures, then
npm run roll-quarter -- --data new-quarter.json
npm run check && npm run build
```

That appends the quarter to `REPORTED`, drops it from the front of `Q` and from
every driver array, and extends the far end by one quarter so the horizon stays
ten. The added column simply carries the previous quarter's assumptions forward
— it is a placeholder, so review it in `/admin` afterwards. Pass `--dry` to see
what would change, or `--no-extend` to let the horizon shorten instead.

`npm run check` is worth running after any hand edit: the engine indexes driver
arrays positionally, so a length mismatch would not throw, it would quietly
produce NaN somewhere in the output.

## Changing the model

Either edit `src/dashboard/assumptions.js` and redeploy:

```bash
npm run check && npm run build
npx wrangler pages deploy dist --project-name=x-mantou --commit-dirty=true
```

…or edit it live in the panel on `/admin` and press **Publish**, which needs no
deploy. Ratios are fractions; money is $ millions per quarter unless the name says
otherwise; every driver array must have one entry per quarter in `Q`.

Each page has to stay a single self-contained file — Pages serves them directly and
the published Artifact copy blocks external scripts — which is why `build.js`
concatenates rather than bundles.

## Admin

`/admin` is the public dashboard plus the model-assumptions editor. It is gated by
Cloudflare Access, and every admin API route verifies the Access JWT itself rather
than trusting the edge — audience, issuer, expiry and RS256 signature against the
team's published keys.

**Until `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` are set, every admin route returns
503 and `/admin` is closed to everyone, including you.** That is deliberate: an
unconfigured deployment should be shut, not open.

Publishing from the panel writes to D1 and becomes the live model for every
visitor; the committed `assumptions.js` stays the fallback default, and *Revert to
defaults* drops the saved row. The payload is checked against an allow-list of
numeric paths, so a crafted request cannot add keys or non-numeric values.

## Backend

D1 database `x-mantou-comments`. **Pages only picks up a secret or variable on the
next deployment**, so always redeploy after changing one:

```bash
npx wrangler pages secret put TURNSTILE_SECRET --project-name=x-mantou
npm run build && npx wrangler pages deploy dist --project-name=x-mantou
```

| Secret / var | Purpose |
|---|---|
| `ACCESS_TEAM_DOMAIN` / `ACCESS_AUD` | Cloudflare Access application in front of `/admin` |
| `TURNSTILE_SECRET` / `TURNSTILE_SITEKEY` | Bot check on comment posting |
| `RATE_SALT` | Salt for the hashed-IP rate limiter (raw IPs are never stored) |

Limits: 5 comments and 60 votes per IP per 10 minutes. Votes are keyed to a
server-derived IP hash, not a client-supplied id.

## Deploying

`git push` triggers `.github/workflows/deploy.yml`, which needs repo secrets
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Deploying by hand with the
wrangler command above works regardless.
