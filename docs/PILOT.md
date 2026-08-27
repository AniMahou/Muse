# Muse — pilot proposal

One distributor. One territory. Thirty reps. Ninety days.

This document exists so the question at the end of a demo is not "that was
interesting, what now" but "can we do this in Mirpur in October". It is
deliberately small: the version of this that asks for a company-wide rollout
gets a polite no, and the version that asks for one territory gets an answer.

---

## What we are proposing to test

Not whether the technology works — you will have seen that. Three business
questions, none of which any amount of engineering can answer from here:

1. **Will reps actually use it?** Fifteen seconds a visit is nothing on paper.
   Field tools die anyway, because they take from the rep and give nothing
   back. This is the risk that decides the product.
2. **Does anyone act on what it surfaces?** Capturing a competitor promo is
   worthless if it lands on a dashboard nobody opens. We measure the response,
   not the capture.
3. **Does it surface things you would otherwise have missed?** The only
   question a brand manager actually cares about.

---

## What we need from you

| | |
|---|---|
| **SKU master** | CSV. Product id, name, brand, pack. Whatever your DMS exports. |
| **Outlet master** | CSV. Outlet id, name, GPS, territory. |
| **Rep roster** | CSV. Rep id, name, territory, brand portfolio. |
| **A field-ops champion** | One person who can tell thirty reps to use it. Without this it does not matter how good the product is. |
| **Two hours** | One training session with the reps. Not two hours each — two hours total. |

The import path already exists and is three files. We are not asking to
integrate with your systems, replace anything, or be a system of record — Muse
reads a copy of your master data and writes observations. If the pilot ends,
you switch it off and nothing else changes.

**On data residency:** the speech model can run entirely inside your
infrastructure. Nothing has to leave your network — no audio, no outlet
coverage, no SKU master. That path is built, not planned. If your security
review would otherwise stop this, it does not have to.

---

## What we do

| Week | |
|---|---|
| 0 | Import your three files. Configure territories and brand portfolios. |
| 1 | Train thirty reps. One session. The app has three screens on purpose. |
| 2–11 | Run. Weekly check-in, fortnightly review of what surfaced. |
| 12 | Read out against the criteria below, and decide. |

We do not need your systems, your engineers, or a procurement process. We need
the three files and the champion.

---

## How it is scored

Agreed before we start, so nobody argues about the goalposts afterwards.

### Adoption — the one that decides it

| | target |
|---|---|
| Reps recording at least once on a working day | **≥ 60%** by week 6 |
| Median recordings per active rep per day | ≥ 4 |
| Reps still active in week 11 who were active in week 3 | ≥ 70% |

Retention matters more than the headline number. A tool everyone tries and
half abandon has failed, whatever the week-2 chart says.

### Response — what the product is actually for

| | target |
|---|---|
| Median time from a corroborated signal being raised to a human acknowledging it | **< 24 hours** |
| Share of high-severity signals acknowledged at all | ≥ 80% |

An alert is raised when several outlets independently report the same thing —
a competitor promotion, a stock-out, a price move. One rep is an anecdote;
agreement across shops is a market event. Both ends of that clock are inside
the system, so this number is measured, not estimated.

### Discovery — the reason to care

| | |
|---|---|
| Competitor promotions surfaced that your existing reporting did not catch | counted, with dates |
| Stock-outs surfaced before the next audit cycle would have found them | counted, with dates |
| Field accuracy on a labelled sample from **your** outlets | measured, published to you |

The third one matters and we will not fake it. Accuracy on our own recordings
is not evidence about your reps, your products or your territory. Part of the
pilot is building a labelled set from real visits and reporting the number
honestly, including where it is bad.

---

## What we are not claiming

Muse does not fix a stock-out. That is the distributor's job. What it changes
is how long it takes anyone to know — from "found at the next audit" to "on
Tuesday afternoon". Everything above measures that and nothing more.

We also have no measured accuracy on Bangladeshi field audio at scale, no
existing customer, and no pilot behind us. You would be the first. The honest
version of the pitch is that the architecture is built and tested and the
evidence is not there yet — which is exactly what a pilot is for.

---

## What would make us stop

Volunteered, because a proposal with no failure condition is a sales document.

- **Rep daily-active below 40% at week 6.** The adoption model is wrong.
  Not "needs more training" — wrong. We stop and rethink the product, and we
  will say so rather than run out the clock.
- **Median response time above 72 hours at week 8.** Nobody at HQ is acting on
  what we surface, which means we built an archive rather than an alert.
- **Fewer than ten genuinely new findings by week 8.** If your existing
  reporting already catches everything we catch, we are a more expensive way
  to learn the same things and you should not buy it.

Any one of those and we end the pilot early. We would rather have a clear
negative in ninety days than an ambiguous maybe in a year.

---

## Commercials

Free for the ninety days. We are buying evidence, not revenue.

Afterwards, per rep per month. We have modelled around ৳1,200, which for a
150-rep force is roughly ৳2.16M a year — but that is a model, not a price, and
we have not tested willingness to pay with anyone. Establishing that is part of
what the pilot is for, and we would rather agree it with you at week 12 than
quote you a number now that neither of us can defend.

**What we would want in exchange for the free period:** permission to say you
ran it, and a reference conversation if it goes well. If it goes badly, we
expect neither.

---

## The arithmetic behind the interest

Stated as a model, with the assumptions visible, because a round number nobody
can check is worth less than a smaller one they can.

```
Covered outlets                                 10,000
Average monthly sell-through per outlet         ৳25,000
Annual revenue through those outlets            ৳3.0B

Out-of-stock rate, global average                8.3%   [IHL Group / NIQ]
Share of stock-outs that become lost sales        58%   [Zebra]
                                                 ─────
Revenue lost to stock-outs         8.3% × 58% =   4.8%  →  ৳144M / year

Reduction in stock-out duration                    20%  ← OUR ASSUMPTION
                                                 ৳28.8M / year recovered
Cost at 150 reps × ৳1,200/month                  ৳2.16M / year
                                                 ─────
                                                  ~13×
```

**The 20% is an assumption and nothing else.** Every other line has a source.
Halve it and the return is still sixfold; quarter it and it still pays for
itself three times over. The pilot exists to replace that one number with a
measurement — which is why "median time to acknowledge" is a success criterion
rather than a vanity metric.

---

## The ask, in one sentence

Three CSVs, one champion, thirty reps, ninety days — and an agreement to stop
early if the numbers above say we should.
