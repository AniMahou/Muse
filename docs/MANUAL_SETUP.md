# Manual setup — what only you can do

Everything in this file needs a human. The code is written and tested; these
are the credentials, installs and decisions that cannot be committed.

**Nothing here costs money and nothing here needs a credit card.**

---

## 1. Prerequisites

| Tool | Version | Check |
|---|---|---|
| Node | 20+ (26 tested) | `node -v` |
| Docker Desktop | any recent | `docker --version` |

**Ports.** Muse uses **27018** (Mongo) and **6380** (Redis), not the defaults.
This is deliberate: 27017 and 6379 are routinely already taken by another
project on the same machine, and pointing at a stranger's database is a silent
failure rather than a loud one. Override with `MONGO_PORT` / `REDIS_PORT` if
even these collide.

---

## 2. Install and start infrastructure

```bash
npm install                       # repo root — installs zod for shared/
cd backend && npm install
cd .. && npm run dev:infra        # MongoDB + Redis via docker compose
```

`dev:infra` starts two containers only — `muse-mongo` and `muse-redis`. There
is no RabbitMQ; BullMQ runs on the Redis you already have.

Verify:

```bash
docker ps --filter name=muse
```

---

## 3. Create your `.env`

```bash
cp backend/.env.example backend/.env
```

The file is heavily commented. Everything below is what you have to fill in
yourself.

---

## 3b. Run it right now, with no API key

`ASR_PROVIDER` and `LLM_PROVIDER` both default to `fake`, which is a real
**offline demo mode**, not a stub:

```bash
cd backend && npm run seed:catalog
cd .. && npm run dev
```

Then upload anything — the audio bytes are ignored — and the full pipeline
runs with no network:

```bash
curl -X POST http://localhost:4000/api/observations \
  -H "Authorization: Bearer <token from seed>" -H "Content-Type: application/json" \
  -d '{"clientUuid":"'$(uuidgen)'","audioBase64":"'$(head -c 1024 /dev/urandom | base64)'",
       "mimeType":"audio/webm","geo":{"lat":23.7806,"lng":90.4074},
       "declaredOutletId":null,"recordedAt":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}'
```

The canned transcript is deliberately the ASR-CORRUPTED reference clip
(প্রান, দের, হইল — all wrong), and the resolvers still recover SKU-404,
18 pieces, COMP-WHEEL and OUT-1182. A demo that only worked on clean input
would prove nothing.

**This is also your exhibition backup.** Venue wifi fails; a demo that dies
with it is a demo that did not happen.

---

## 4. Get a Groq API key — recommended, 2 minutes

Groq is the default for **both** speech recognition and the assembly model, so
this single key is the only one strictly required.

1. Go to **https://console.groq.com**
2. Sign in with Google or GitHub. **No credit card is requested.**
3. Left sidebar → **API Keys** → **Create API Key**
4. Copy it immediately — it is shown once
5. Put it in `backend/.env`:

```dotenv
GROQ_API_KEY=gsk_your_key_here
ASR_PROVIDER=groq
LLM_PROVIDER=groq
```

Free-tier limits, comfortably beyond a 100-clip evaluation set:

| | Limit |
|---|---|
| Audio transcription | ~2,000 requests/day |
| Chat requests | 30/min, ~14,400/day |

---

## 5. Optional — a Gemini key as a second opinion

Worth having for the **day-0 ASR bake-off**, where the whole point is
comparing providers on your own audio.

1. Go to **https://aistudio.google.com/apikey**
2. **Create API key** → pick or create a project. No card.
3. Add to `.env`:

```dotenv
GEMINI_API_KEY=your_key_here
```

Two caveats, both real:

- Gemini returns **text only** — no timestamps, no log-probabilities. Stage 6
  therefore loses one of the terms it multiplies, and every word gets a flat
  0.72 with the transcript flagged `confidenceDerived`. Fine for comparison,
  weaker in production.
- On the free tier **Google may use submitted data to improve their products**.
  Fine for development audio. Do not send real customer field recordings
  through it.

---

## 6. Optional — whisper.cpp for fully local ASR

Do this before the exhibition. "Field audio never leaves your infrastructure"
is a better answer to an enterprise data-residency question than any accuracy
number, and it is also your offline backup when venue wifi fails.

```bash
brew install whisper-cpp
mkdir -p ~/whisper-models && cd ~/whisper-models
curl -L -o ggml-large-v3.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin
```

```dotenv
ASR_PROVIDER=local
WHISPER_CPP_BIN=/opt/homebrew/bin/whisper-cli
WHISPER_CPP_MODEL=/Users/YOU/whisper-models/ggml-large-v3.bin
```

Confirm the binary name — some builds install it as `whisper-cli`, older ones
as `main`:

```bash
ls /opt/homebrew/bin | grep -i whisper
```

The model is ~3 GB. Download it on a connection you trust, not at the venue.

---

## 7. Seed the demo tenant

```bash
cd backend && npm run seed:catalog
```

It prints a **rep bearer token**. Save it — it is how the PWA and every curl
example authenticate. To pin a stable one:

```bash
SEED_REP_TOKEN=my-dev-token npm run seed:catalog
```

---

## 8. Run it

```bash
npm run dev        # from the repo root: API + worker together
```

- API → http://localhost:4000
- Health → http://localhost:4000/health

---

## 9. Decisions only you can make

### Collect the field audio

**This is the real critical path and no amount of code substitutes for it.**
The evaluation set needs ~100 real clips from actual reps, hand-labelled.
Everything measurable about this system is downstream of that.

Put audio in `backend/datasets/clips/` and labels in `backend/datasets/labels/`,
one JSON per clip matching `shared/label.schema.ts`. The schema is enforced —
when three people are labelling, inconsistent labels silently corrupt every
metric for a week before anyone notices.

### Run the ASR bake-off

Record ~20 clips yourself, five with a fan and street noise. Run each through
Groq, Gemini and local whisper. Score **field-level accuracy, not WER**.

Above ~70% raw on the noisy clips, the resolver layer will carry you past 90%.
Below ~50%, narrow the schema before writing more code.

### Replace the demo catalogue

`backend/scripts/seed-catalog.ts` holds eleven SKUs and four outlets. Real
brand names and a real outlet list make every demo more convincing and every
metric more honest.

### BrainChild registration

Not something I can do:

- Confirm **2–3 currently-enrolled students** — solo entry is disqualifying
- Register by **20 August**
- Call Ahsanul Hoque Abir, **+88 01875507852**, and ask what the submission
  actually requires (video? repo link? deck?)

---

## Troubleshooting

**`Cannot find module 'zod'` from `shared/`** — run `npm install` at the repo
root, not only in `backend/`. `shared/` resolves its dependencies from there.

**`Missing required environment variables`** — the provider selected in
`ASR_PROVIDER`/`LLM_PROVIDER` has no key. Set `fake` for both to run the test
suite with no credentials at all.

**`ECONNREFUSED 127.0.0.1:27017`** — `npm run dev:infra` first.

**Mongo `$nearSphere` errors** — the 2dsphere index is missing. Both the API
and `seed:catalog` call `ensureIndexes` on boot; run either once.

**Groq 429** — free-tier rate limit. BullMQ retries with exponential backoff
and the clip is only marked failed once no attempt remains.
