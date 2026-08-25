# Muse — Q&A preparation

For the Intelligent Machines demo. Assume the room contains engineers who will
probe the architecture and a CEO who will probe the business.

**Three rules before anything else.**

1. **Answer the question actually asked, then stop.** Over-explaining reads as
   defensiveness. A short confident answer invites a follow-up, which is where
   you win.
2. **Say "I don't know" when you don't.** This room can tell. One honest
   admission buys credibility for everything else you claim.
3. **Never oversell the accuracy.** You do not have a measured accuracy number
   yet. Own that early and it stops being a weakness.

---

## The five hardest questions

These decide how the room reads you. Rehearse these until they're automatic.

### Q. "You have two API calls and some string matching. Where's the AI?"

> "Two model calls, deliberately. The interesting work is what surrounds them.
>
> A language model handed a 34%-wrong transcript will produce a plausible wrong
> answer with high confidence — that's the failure mode that makes this
> undeployable. So the model never identifies anything. Its response schema is
> rebuilt per recording with the product field restricted to exactly what the
> resolvers found, which makes an unresolvable product *inexpressible* rather
> than discouraged. And confidence comes from evidence — audio confidence over
> the specific characters, resolver margin, grammar match — never from asking
> the model how sure it is, because models are badly calibrated.
>
> I'd rather have two model calls I can defend than six I can't."

**If pushed further:** "The honest answer is that for an AI contest this looks
thin, and the thing that would fix it is a learned confidence model trained on
our own errors. It's a day of work and it's blocked on labelled data, not on
ideas."

---

### Q. "What stops us building this in three weeks?"

*Expect this from the CEO. It is not hostile — it is the real question.*

> "Nothing stops you building the pipeline. You'd have it working in three
> weeks, and it would be about 70% right.
>
> What takes longer is the last 30%, and it's all unglamorous. The Bangla
> quantity grammar — দেড়, আড়াই, পৌনে, which subtracts. The phonetic collapse
> table, where I lost a day to Unicode's composition-exclusion list silently
> turning ড় into /d/ when it's /r/. Discovering that সতেরো and স্টোরে share a
> consonant skeleton, so one similarity function had to become two. Finding
> that a hard confidence gate discarded a perfectly good 0.72 name match and
> attributed observations to the wrong shop.
>
> None of that is in a paper. You find it by running real audio and reading the
> output. That's a data-collection cost more than an engineering one — and it's
> exactly the kind of cost you'd rather buy than repeat."

---

### Q. "What happens when Google ships Bangla ASR at 5% word error rate?"

*The genuinely dangerous question. Do not flinch.*

> "It makes us better, not obsolete.
>
> Our value isn't transcription — it's resolution. Even with a perfect
> transcript you still have to map 'PRAN mango juice' to a SKU ID out of two
> thousand, decide whether দেড় ডজন is 18 or 1.5, know which of three shops
> within twenty metres the rep is standing in, and decide whether you're
> confident enough to put it on a dashboard.
>
> Better ASR raises our floor. We designed for 34% because that's today; at 10%
> our field accuracy goes up and our clarification rate goes down. The
> architecture doesn't change."

---

### Q. "Bangladesh labour is cheap. Why not just hire three more people?"

> "You're right that this can't be a labour-replacement pitch here — a rep
> costs twelve to twenty thousand taka a month, so 'AI replaces a person'
> saves almost nothing.
>
> This is a revenue-protection play. Three more people still can't correlate
> complaints across a region, still can't tell you on Tuesday that a competitor
> promo started in twelve shops, and still won't type context at forty outlets
> a day — because nobody would.
>
> We're not capturing data more cheaply. We're capturing data that currently
> doesn't exist at any price."

---

### Q. "What's your accuracy?"

*The one you must not bluff.*

> "On word error rate, roughly what the published Bangla figures say — around a
> third on real field audio.
>
> On field-level accuracy, which is the number that matters, I can show you
> verified individual cases today. What I can't give you is a population
> number, because that needs a hundred labelled field recordings and we haven't
> collected them yet. The evaluation harness is built and gated on regression —
> I'd rather show you the harness than quote a number I can't defend."

**Then immediately show the worked example.** Turning "I don't have that" into
"here's what I do have" in one move is the whole trick.

---

## Technical questions

**"Why not fine-tune Whisper on Bangla instead of all this?"**
> "We plan to, via n-gram shallow fusion over the customer's own catalogue — it's
> about a day's work and it's the single most credible chart we could produce.
> But it doesn't replace the resolver. A fine-tune improves the transcript; it
> doesn't tell you which of two thousand SKUs was meant, or how confident to be."

**"Why not a vision-language model end-to-end on the photo?"**
> "Same reason. A VLM will read the note and confidently produce a product name
> that doesn't exist in the customer's catalogue. Constraining generation to the
> resolved candidate set is what makes the output checkable."

**"Isn't your phonetic matching just fuzzy string matching?"**
> "It's fuzzy matching in a space we constructed. Raw edit distance on Bangla
> fails — তীন and তিন differ by one character in three, which scores 0.67 and
> gets rejected, but they're the same word. Collapsing শ/ষ/স onto /s/, vowel
> length, and aspiration first is what makes the distance meaningful. And the
> Latin side has to fold into the same space, because catalogues are in English
> while reps speak Bangla — initial 'wh' maps to হু, or Wheel never matches
> হুইল."

**"How do you handle the LLM hallucinating a product?"**
> "It can't. The schema is rebuilt per clip and the product field is an enum of
> exactly the candidates the resolver produced. A hallucinated SKU fails
> validation. Numbers get a second guard, because a schema can't bind a float —
> any quantity the model returns is checked against what the grammar actually
> parsed."

**"What's your latency?"**
> "About two and a half seconds end to end, and almost all of it is the two
> external calls — extraction is 450 milliseconds to 1.2 seconds, assembly about
> 1.9. Our own logic — grammar, both resolvers, confidence — is roughly 40
> milliseconds."

**"How does it scale to a catalogue of five thousand SKUs?"**
> "Territory scoping. A rep doesn't sell five thousand SKUs, he sells about a
> hundred and fifty in his brand portfolio. We scope the candidate set before
> matching, which shrinks the search *and* removes confusable products he
> couldn't have said — so accuracy goes up as the catalogue grows, provided the
> portfolio is maintained. That's why the rep-assignment screen isn't
> bookkeeping."

**"What about offline? Rural connectivity is terrible."**
> "The recording goes to IndexedDB before anything else and uploads in the
> background. The rep never waits and never sees an error. The client generates
> the idempotency key, so retrying an upload that actually succeeded is safe."

**"How do you know your confidence numbers mean anything?"**
> "Right now, we don't — not at a population level. That's what the calibration
> curve in the eval harness is for: of the fields we passed at 0.9, how many were
> actually right. A system whose 0.9 means 0.6 is worse than no confidence at
> all, because it suppresses the prompts that would have caught its errors.
> Measuring that honestly is on the critical path."

**"Why TypeScript and not Python for an ML product?"**
> "Because there's no model training in the serving path — it's an orchestration
> and data problem, and the whole thing is one language from the pipeline to the
> browser. When we add the learned confidence model and the ASR fine-tune,
> those train in Python offline and ship as artefacts. Nothing about that
> requires the API to be Python."

---

## Business questions

**"Who actually signs the cheque?"**
> "A brand or category manager at a company like ACI, PRAN, Unilever or BAT —
> someone who currently learns about competitor moves from a sales dip. Field
> operations is the operator, not the buyer. They're different people and we
> built two different applications for that reason."

**"Why wouldn't Unilever just build this internally?"**
> "They could. They'd also need Bangla speech expertise, a linguist's worth of
> numeral-grammar work, and eighteen months of patience for something that isn't
> their core business. The same argument applied to every SaaS category. And the
> learning is customer-specific — after six months it knows how *their* reps say
> *their* products, which is a switching cost they'd be building for themselves
> anyway."

**"What's the pricing model?"**
> "Per representative per month. We've modelled around twelve hundred taka,
> which for a hundred and fifty reps is about two million a year. The honest
> answer is we haven't tested willingness to pay — that's what a pilot is for."

**"Why won't the SFA vendors just add this?"**
> "They'll try, and the ones with distribution advantage are the real
> competitive threat — more than another startup. What they'd have to build is
> the Bangla resolution layer, which isn't an API integration. Realistically our
> best outcome may be being the layer they license rather than out-competing
> their sales force."

**"How do you land the first customer?"**
> "One distributor, one territory, thirty reps, ninety days, measured against
> their own stock-out data. Not a company-wide rollout. The pitch to a brand
> manager is 'tell me what you'd want to know on Tuesday instead of October',
> and then show them it in their own outlets."

**"What's the market size, really?"**
> "Bangladesh FMCG is about four billion dollars with 97% of trade through
> traditional retail — small shops visited by a person. That's the shape of the
> market, not our addressable revenue. Our realistic serviceable market is the
> field forces of the top twenty or thirty brands, which is thousands of reps,
> not hundreds of thousands. I'd rather quote that honestly than a top-down
> number."

**"Is this defensible or is it a feature?"**
> "Today it's closer to a feature with a hard technical moat than a platform.
> The three things that make it hard to copy are the Bangla resolution work, the
> customer-specific alias learning that compounds, and constrained decoding
> making it safe enough to connect to master data. Whether that's a company or
> a licensed component is genuinely open, and I'd rather say that than pretend."

**"How does this expand beyond FMCG?"**
> "Same architecture, different catalogue and schema. Pharmaceutical reps
> writing doctor call notes. Microfinance officers writing borrower visits. NGO
> field surveys. Agricultural extension officers. Every one is a Bangla-speaking
> field worker whose observations currently die on paper. FMCG is the beachhead
> because the catalogue is well-defined and the buyer is obvious."

**"What's the data ownership story?"**
> "The customer's data is theirs. We don't currently syndicate anything, and I'd
> be careful about the aggregated-market-intelligence business some people will
> suggest — reselling one client's competitive intelligence to their rivals
> needs an explicit consent story before it's even discussable."

---

## Questions about what's missing

**"The handwriting recognition is fake. Why should I trust anything else?"**
> "Because we labelled it rather than hiding it — it says 'simulated' on the
> capture screen, on every result, and in the console analytics. And the mock is
> only the reading step. The photo runs through the same grammar, the same
> resolver, the same confidence gate as speech — you saw it resolve New Alam
> Enterprise and Surf Excel and three cartons from that note.
>
> We built it that way on purpose. Swapping in a real OCR model is one file, and
> in the meantime it proves the pipeline is genuinely modality-agnostic rather
> than us claiming it is."

**"How much of this is real versus demo?"**
> "The pipeline is real — 412 tests, running on live speech and language models
> with real API keys. The handwriting reading is simulated. The evaluation
> numbers don't exist yet. Everything else you saw is the actual system."

**"Who's using it?"**
> "Nobody. No pilot, no users. It runs end to end on a demo tenant, and the only
> real field audio is a handful of recordings we made ourselves. That's the
> single biggest gap and it's a fieldwork problem, not a coding one."

**"What would you build next if you had a month?"**
> "Not features. A hundred labelled field recordings, because every number I
> can't give you today is blocked on that. Then the learned confidence model,
> which trains on exactly that data. Then real OCR."

---

## If you get stuck

- **You don't know:** "I don't know. I'd have to measure it." Then move on.
- **They're right and you're wrong:** "That's a fair point, and I hadn't
  considered it." Do not argue. Conceding cleanly is a strength signal.
- **The question is vague:** "Do you mean X or Y?" Buying five seconds is fine.
- **It's outside the demo:** "That's past where we've built. Here's how I'd
  approach it —" and give one sentence, not five.
- **Hostile framing:** answer the technical content, ignore the framing entirely.

---

## Questions to ask them

If the CEO opens the floor, having a question ready changes the dynamic from
examination to conversation.

- "Where have you seen field-data capture fail before? I'd rather know the
  failure mode than guess at it."
- "If you were selling this into an account you already have, what's the first
  objection you'd expect from their field operations head?"
- "Is the licensed-component path more realistic here than a standalone
  product?"

---

## The one-liner, if all you get is thirty seconds

> "A field rep speaks fifteen seconds of Bangla into a phone. Speech recognition
> gets a third of the words wrong, and we still get the shop, the product and
> the quantity right — because we recover the fields, not the transcript. And
> when we're not sure, the system says so instead of guessing."
