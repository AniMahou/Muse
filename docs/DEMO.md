# Demo runbook

For the Intelligent Machines presentation. Read the recovery section before you
go on, not while something is failing.

---

## Twenty minutes before

Four terminals, in this order. Each one waits for the previous.

```bash
npm run dev:infra
```

```bash
cd backend && npm run demo:reset
```

```bash
npm run dev
```

Then open **http://localhost:5173** and log in once to warm everything up.

```
Console     demo@muse.test   / demo12345
Field app   rahim@muse.test  / demo12345
```

**Run `demo:reset` again five minutes before you walk on.** Rehearsing consumes
the demo: acknowledging the alert closes it, recording adds clips, answering a
prompt clears it. The second run of a demo should look exactly like the first,
and this is the only thing that guarantees it.

### What reset puts there

| | |
|---|---|
| 15 observations | spread across the last few days, so nothing is empty |
| **1 open alert** | Wheel promo, 3 outlets — this is the one you acknowledge live |
| 1 answered alert | so "median response" shows a real number rather than a dash |
| 1 flagged record | waiting in Review with an amber confidence bar |
| 1 pending prompt | waiting in the rep app |
| 1 alias candidate | waiting on the Teach screen |

A stock-out sits at **two** outlets deliberately — below the three-outlet
threshold. If someone asks "does it alert on everything", that is the answer:
it is a rule, and here is a case where it declines to fire.

---

## The run

### 1 · The problem (console → Today)

Land on Today. Fifteen observations, four outlets, two reps — a working system
with a week of history behind it, not an empty shell.

### 2 · Capture (field app)

Click **Record a clip**. Hold, speak one card's worth of Bangla, release.

Say out loud what is happening: it lands in the browser's own storage first and
uploads in the background, so the rep never waits and never sees an error.

> Expect **five to fifteen seconds** before it appears on the console. Two
> external model calls. Fill the gap by explaining the pipeline rather than
> watching a spinner in silence.

### 3 · Structure (console → Today, live feed)

The new card appears without a refresh — that is a websocket, not polling.
Point at the fields: outlet resolved from GPS and a spoken name, product matched
against a closed catalogue, দেড় ডজন resolved to 18.

### 4 · Honesty (console → Review)

One record the system was not sure about. The transcript is shaded by per-field
confidence, so the reviewer sees *where* to look before they listen. Say the
line: **low confidence never discards data, it sets a status.**

### 5 · The point (console → Today, "Needs a decision")

The Wheel alert. Three different outlets, three different visits, same
competitor promotion, inside a day.

> "One rep saying this is an anecdote — he might have misheard. Three shops
> independently is a campaign. That distinction is the product."

Click **Acknowledge**. Watch **median response** move. Then:

> "That number is what a pilot is scored on. We don't fix the stock-out — that's
> the distributor's job. We compress how long it takes anyone to know, and both
> ends of that clock are inside the system."

### 6 · The rep gets something back (field app → My Day)

His own week: reports made, and how many became alerts HQ acted on. The answer
to "my reps will use it for two weeks and stop."

### 7 · The ask

[PILOT.md](PILOT.md). One distributor, one territory, thirty reps, ninety days.
Three CSVs and a champion.

---

## If something breaks

### A recording does not appear

Give it thirty seconds — the queue retries a rate-limited clip up to six times
with backoff, so a throttled clip arrives late rather than failing. Keep talking.

If it still has not landed, **do not stand there reloading.** Say "that one is
still in the queue, here's one from this morning" and use the seeded data. The
console is full of real observations; nothing about the story depends on that
specific clip.

### The models are unreachable — venue wifi, expired key, Groq down

Stop the app, switch to offline mode, restart:

```bash
ASR_PROVIDER=fake LLM_PROVIDER=fake npm run dev
```

The whole pipeline still runs: the fake recogniser returns a deliberately
*corrupted* Bangla transcript (প্রান, দের, হইল) and every stage after it is
real — the numeral grammar, both resolvers, confidence, the alert rule. The demo
is intact and you can say so honestly. **Do not claim it is live.**

### The console looks empty or the wrong company

You are logged into a tenant from an earlier sign-up. Sign out, run
`npm run demo:reset`, log back in as `demo@muse.test`.

### Nothing loads at all

```bash
npm run dev:infra
```

Mongo is on **27018** and Redis on **6380**, not the defaults — 27017 was taken
by another project on this machine.

---

## Numbers you can quote

**Measured, ours:**

- 449 automated tests, full suite under two seconds
- Field accuracy **52.6%** on 20 labelled clips, live models
- Character error rate 28.5% · word error rate 77.8%
- Deterministic layer — grammar, both resolvers, confidence — is **~38ms** of a
  ~2.4s pipeline

**About the accuracy, say this before you are asked:**

> "Twenty clips, one speaker, recorded reading a script in a quiet room. The
> word error rate is an over-estimate because the reference is the script rather
> than an independent transcription. It is a thin set and we are not going to
> present it as more than it is — what it shows is the shape: the recogniser
> loses most of the words, and we still recover more than half the fields. A
> proper measurement on a customer's own outlets is part of what the pilot is
> for."

Then move on. Do not defend it further.

**Do not claim:** a measured accuracy on real field audio, any customer, any
pilot, or that handwriting recognition reads pixels. The photo path is labelled
simulated in the product and should be labelled simulated on stage.
