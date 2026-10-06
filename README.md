# GymRank

A local web app that turns a gym logbook into a strength rank measured against
published strength standards for your own sex and bodyweight, adjusted for age.

One pull-up by a 20-year-old woman at 50 kg and one pull-up by a 60-year-old man
at 90 kg are not the same achievement. A logbook that records "1 pull-up" for
both tells you nothing. GymRank scores them 342 and 406 on a 0–1000 scale, and
[shows its working](MATHS.md).

Built for Software Engineering, Phase 1. Everything runs on one laptop: no
cloud, no containers, no network at runtime.

---

## Requirements

**Node.js 24 or newer.** The app uses `node:sqlite`, which is built into Node —
there is no database to install and no native module to compile.

```sh
node --version   # must be v24 or later
```

## Setup

```sh
npm run setup
```

Installs dependencies for the API and the client. Copy the example environment
file if you want to change anything; the app runs without it.

```sh
cp .env.example .env
```

## Running it

### For the demo — one command, one origin

```sh
npm run build && npm start
```

Then open **http://localhost:3000**. Express serves the built client and the
API from the same origin, so there is a single process and a single port.

Verify this path before demo day rather than five minutes before it.

### For development — two processes

```sh
npm run dev:server    # Express on :3000
npm run dev:client    # Vite on :5173
```

Open **http://localhost:5173**. Vite proxies `/api` to Express, so the browser
sees one origin and the session cookie works without CORS.

## A populated account to look at

A fresh account demonstrates the empty states, not the product. The charts need
history before they say anything:

```sh
cd server && npm run seed:demo
```

Creates **`demo@gymrank.local` / `demo-password`** with roughly six months of
plausible training: 13 weigh-ins and 91 sets, bodyweight climbing 78 → 83 kg and
the overall index 251 → 452. Re-running it recreates that one account and
touches nothing else.

### The two friend accounts

The demo database also holds two accounts that are friends with each other,
each with six months of training, so the friends page and the public profile
have something to compare:

| Account | Email / password | Training | Overall rank |
|---|---|---|---|
| **alex** | `alex@gymrank.local` / `alex-password` | Upper/lower split, 4 days a week (~3.6 sessions a week) | Gold II |
| **lucas** | `lucas@gymrank.local` / `lucas-password` | Full body, 3 days a week (~2.6 sessions a week) | Gold III |

Alex is slightly the stronger of the two. Lucas, being lighter, edges just
ahead on the squat once bodyweight is accounted for. Both progress steadily:
each lift is trained with one fixed scheme and the working weight only goes
up, so the charts climb rather than zigzag.

The database file is git-ignored, so these accounts exist only in the copy
they were created in.

---

## What it does

| | |
|---|---|
| **Accounts** | Signup, login, logout, sessions that survive a server restart |
| **Performances** | Full CRUD over your sets, each scored on the way out |
| **Ranks** | Per exercise and overall, with the exact kilograms to the next division |
| **Progress** | Estimated 1RM over time, strength index against the rank thresholds, a radar of your current index, and bodyweight against your overall index |
| **Friends** | Send and accept requests by username, and see a friend's ranks — never their body data |

Seven exercises are tracked: back squat, bench press, deadlift, overhead press,
pull-up, dip and push-up.

Eight ranks — Iron, Bronze, Silver, Gold, Platinum, Diamond, Master and
Unkillable Demon King — each split into four divisions, IV to I. About thirty
steps. The first arrive within weeks; the last is meant to stay out of reach.

**There is no leaderboard.** Ranks are read from fixed, published standards
(Strength Level's tables, by bodyweight), so your rank never depends on anybody
else in the app. Friends are
listed alphabetically and are never sorted by rank.

---

## Project layout

```
server/                 Express 5 API, one Node process
  lib/scoring.js        the scoring engine — pure, no database, no clock
  lib/scoring-config.js every constant and standards table, with its source
  migrations/           numbered SQL, applied on startup
  routes/               auth me performances exercises ranks stats friends users
  middleware/           requireAuth validate jsonOnly errorHandler throttle
  services/             performances ranks stats explain friends
  test/                 node --test
client/                 React 18 + Vite single-page app
  src/components/       Card RankBadge ProgressBar Toast EmptyState …
  src/pages/            one file per route
poster.html             the one-page A4 poster
MATHS.md                every formula, its source, and its limitations
```

## Scripts

Run from the repository root:

| Command | What it does |
|---|---|
| `npm run setup` | Install dependencies for both halves |
| `npm run dev:server` | Express with `--watch` on :3000 |
| `npm run dev:client` | Vite on :5173, proxying `/api` |
| `npm run build` | Build the client into `client/dist` |
| `npm start` | Serve everything from :3000 |
| `npm test` | Run the test suite |

Run from `server/`:

| Command | What it does |
|---|---|
| `npm run migrate` | Apply migrations (the server does this on startup too) |
| `npm run seed:demo` | Create the demo account |
| `npm run smoke` | Drive a running server end to end and print a check table |

## Testing

```sh
npm test                     # 177 tests
cd server && npm run smoke   # 72 checks against a running server
```

The unit tests cover the scoring engine against its published control values,
every age-table boundary, the schema constraints, and the friendship rules. The
smoke run exercises the real HTTP API — including a check that walks every key
of every friend-facing response and fails if any body data, load or note appears
in it.

---

## Security notes

This is a local, single-user app for a course, and the choices reflect that.
What is here:

- **Passwords** are hashed with scrypt (N=16384, r=8, p=1), a random 16-byte
  salt per password, and a constant-time comparison. A login attempt against an
  unknown email performs the same scrypt work against a decoy, so a missing
  account and a wrong password cannot be told apart by timing either.
- **Sessions** are stored in SQLite, not in memory, so restarting the server
  does not log you out. The session id is regenerated on login. The cookie is
  `HttpOnly`, `SameSite=Lax`, and not `Secure` because localhost is plain HTTP.
- **Failed logins** are throttled per email and address.
- **Every mutating request must declare `Content-Type: application/json`.** A
  cross-site form cannot set that header without triggering a CORS preflight,
  so together with `SameSite=Lax` this closes the realistic CSRF vector for a
  local app.
- **Validation runs on the server**, in middleware. The forms validate too, but
  only so the message arrives sooner.
- **Another account's row answers 404, not 403**, so an endpoint never confirms
  that an id exists.

**What a public deployment would need and does not have here:** real CSRF
tokens rather than relying on the content type, HTTPS with `Secure` cookies,
rate limiting on more than the login route, and email verification at signup.

### What friends can see

Friends see **ranks and indices** — already-normalised, relative numbers.

They never see your email, date of birth, height, bodyweight or weight history,
the kilograms on the bar, or your notes. That scoping is done by the SQL
queries, not by filtering the response afterwards: a field dropped late is a
field that was still selected, and one careless `res.json(row)` puts it back on
the wire. You can also hide your ranks from friends entirely, from your profile.

---

## Use of generative AI

This project was built with **Claude Code** (Anthropic), disclosed as the course
requires.

The specification, the scoring design, the constraints and the review at the end
of each phase are ours. The assistant wrote code against that specification one
phase at a time, and each phase was verified with real requests — the API driven
over HTTP, the interface driven in a real browser — before the next one started.

It was not a one-shot generation. Two expected values in our own specification
turned out to be wrong and were corrected only because the engine disagreed with
them; the details are at the end of [MATHS.md](MATHS.md).

---

## Licence and scope

Coursework. Written for Phase 1 and discarded afterwards, as the brief intends.

> Estimates are for information only, based on population-level statistical
> formulas. This is not medical advice and not a training program.
