# Catalogue crib sheet

**Generated — do not edit by hand.** Run `npm run crib` after changing the seed.

Every `sku_id`, `competitor_brand` and `outlet_id` written into ground truth
must appear in one of these tables, spelled exactly as shown.

Tenant `demo-fmcg` · rep `REP-1` (Rahim Uddin) · territory `T-MIRPUR`

---

## Our products — the `sku_id` column

`✓` means the SKU is inside rep REP-1's brand portfolio, so it resolves both in the
evaluation *and* in the live app. A `✗` SKU still resolves in the evaluation — which
passes no brand scope — but is filtered out for this rep in the running product, so
prefer `✓` rows when writing cards you also intend to demo.

| sku_id | name | brand | pack | manufacturer | in portfolio |
| --- | --- | --- | --- | --- | --- |
| `SKU-404` | PRAN Mango Juice | PRAN | 250ml | — | ✓ |
| `SKU-407` | PRAN Mango Drink | PRAN | 1L | — | ✓ |
| `SKU-410` | PRAN Litchi Juice | PRAN | 250ml | — | ✓ |
| `SKU-420` | PRAN Chanachur | PRAN | 150g | — | ✓ |
| `SKU-501` | Surf Excel Powder | Surf Excel | 500g | Unilever | ✓ |
| `SKU-502` | Lux Soap | Lux | 100g | Unilever | ✓ |
| `SKU-504` | Sunsilk Shampoo | Sunsilk | 180ml | Unilever | ✓ |
| `SKU-505` | Clear Shampoo | Clear | 180ml | Unilever | ✓ |
| `SKU-503` | Harpic Toilet Cleaner | Harpic | 500ml | Reckitt | ✗ |
| `SKU-601` | Colgate Toothpaste | Colgate | 100g | Colgate | ✗ |

## Competitors — the `competitor_brand` column

Competitors are **always** in scope; brand portfolio does not filter them.

Note the column these belong in. A competitor id goes in `competitor_brand`, never in
`sku_id` — stage 5 builds them into two separate enums, so a competitor written into
`sku_id` can never be matched and scores as a miss.

| competitor_brand | name | manufacturer |
| --- | --- | --- |
| `COMP-WHEEL` | Wheel | Unilever |
| `COMP-WHITEPLUS` | White Plus | — |
| `COMP-RIN` | Rin Powder | Unilever |

## Outlets — the `outlet_id` column

All four sit within roughly forty metres of each other. That is deliberate: GPS alone
cannot separate them, so the spoken name has to decide, which is the whole reason
stage 4 exists.

| outlet_id | name | lat, lng |
| --- | --- | --- |
| `OUT-1182` | Bijoy Store | 23.78076, 90.40740 |
| `OUT-1183` | Rahman Store | 23.78069, 90.40748 |
| `OUT-1184` | New Alam Enterprise | 23.78046, 90.40745 |
| `OUT-1185` | Shanto General Store | 23.78100, 90.40770 |

Recording GPS for the whole set: `23.7806, 90.4074` — inside the cluster.
You never type coordinates; `npm run labels:build` fills them from `outlet_id`.

---

## Observation types — the `type` column

| type | means | fields that carry the meaning |
|---|---|---|
| `demand_signal` | shop wants to order something | `sku_id`, `quantity`, `unit` |
| `stock_out` | shop has run out | `sku_id` |
| `competitor_promo` | a rival is running an offer | `competitor_brand`, `price_delta` |
| `price_change` | our price moved | `sku_id`, `price_delta` |
| `retailer_complaint` | shopkeeper is unhappy | `sku_id` (optional) |
| `posm_issue` | poster, display or branding problem | `outlet_id` only |

## Units — the `unit` column

`piece` · `carton` · `sack` · `box` · `packet` · `bottle` · `crate` · `kg` · `g` · `litre` · `ml` · `BDT`

## Bangla quantities — what `quantity` should say

Quantity is the **resolved number**, never the words. দেড় ডজন is `18`, not `1.5`.

| spoken | value | worked example |
|---|---|---|
| আধা | 0.5 | |
| দেড় | 1.5 | দেড় ডজন → 1.5 × 12 = **18** |
| আড়াই | 2.5 | আড়াই ডজন → 2.5 × 12 = **30** |
| সাড়ে X | X + 0.5 | সাড়ে তিন কার্টন → **3.5** |
| সোয়া X | X + 0.25 | সোয়া দুই কার্টন → **2.25** |
| **পৌনে X** | **X − 0.25** | পৌনে তিন কার্টন → **2.75** (it subtracts) |
| ডজন | × 12 | |
| হালি | × 4 | দুই হালি → 2 × 4 = **8** |
| কুড়ি | 20 | |

---

## Not scored — do not agonise

The evaluation scores exactly six fields: `type`, `outlet_id`, `sku_id`,
`competitor_brand`, `quantity`, `price_delta`.

`severity`, `unit` and `verbatim_bn` are recorded but **not** scored, so a judgement
call on severity cannot move the accuracy number. Fill them sensibly and move on.

## Sign conventions

`price_delta` is signed, in taka, from *our* point of view.
A competitor undercutting by 5 taka is `-5`. Our price rising 10 taka is `+10`.
Leave it empty when a promo was mentioned without a number.
