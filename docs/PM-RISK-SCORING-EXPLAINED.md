# ECI Cabinet PM — Risk Assessment Scoring Explained

## What the report shows

Every completed PM session produces a one-page Risk Assessment. It contains **two independent outputs** that answer different questions:

| Output | Question answered | Range |
|---|---|---|
| **Condition Risk Index** | How much of this site is in bad shape, relative to its size? | 0 – 100 |
| **Status badge** | What is the worst category of problem found? | GOOD / LOW / MODERATE / CRITICAL |

These are intentionally separate. You can have a low score with a MODERATE badge, and that is correct — it means the site is mostly healthy but at least one moderate-class problem was found somewhere.

---

## The Condition Risk Index (0–100)

### The core idea: rate, not count

The most important thing to understand is that the score is based on **failure rates, not raw counts**.

For every check type, we compute:

> **Failure rate = items that failed ÷ items that were inspected**

**Why this matters:** A site with 20 cabinets and 1 cabinet with a fan failure has a 5% failure rate. A site with 2 cabinets and 1 cabinet with a fan failure has a 50% failure rate. Without this, big sites would always look worse just because they have more components. With rates, a 1-in-20 problem is scored far lower than a 1-in-2 problem of the same type — which matches how serious they actually are.

---

### Severity tiers — the key to fair scoring

The score is split into three tiers with fixed point allocations:

| Tier | Points available | What it covers |
|---|---|---|
| **Critical** | **70 points** | Controller faults, I/O failures, network failures |
| **Moderate** | **20 points** | Power hardware, node performance, cabinet fans, grounding |
| **Slight** | **10 points** | Temperatures, cleanliness, filters, AC voltage |

**This is the critical design decision.** By giving controller and network failures their own 70-point budget, a single controller LED fault on a massive site still registers heavily on the score — it doesn't get washed out by the hundreds of passing power supply and voltage readings.

Within each tier:

> **Tier contribution = tier allocation × min(1, failure rate × 2)**

The ×2 scale means **50% failure rate within a tier = full tier allocation**. Full 100% failure rate also caps at the tier allocation (no double-counting). The three tiers add up to a guaranteed 0–100 total.

**Example — what different scenarios look like:**

| Scenario | Score |
|---|---|
| Nothing wrong | 0 |
| 10% of critical checks failing | 14 |
| 25% of critical checks failing | 35 |
| 50% of critical checks failing | **70** (critical tier maxed) |
| 50% critical + 50% moderate | **84** |
| 50% across all tiers | **100** |

---

### Check types and their weights

Within each tier, individual checks are weighted by operational impact. Weights control how much a single check type pulls the tier score when it is the one failing.

**Critical tier (controls 70 pts of the site score):**

| Check | Weight | What it means |
|---|---|---|
| Controller LED fault | 25 | Controller is indicating a system-level fault |
| I/O module failure | 20 | Direct loss of process control communication |
| Network status failure | 20 | System lost network connectivity |
| Entron switch failure | 20 | Core network switch is down |

**Moderate tier (controls 20 pts of the site score):**

| Check | Weight | What it means |
|---|---|---|
| Node performance index poor (≤ 2/5) | 15 | Controller degraded — near end of performance life |
| DC voltage out of range | 12 | Power rail may cause controller instability |
| Node free time low (≤ 28%) | 12 | Controller near capacity |
| Ground inspection failed | 10 | Electrical safety concern |
| Power supply fail | 8 | Power delivery out of spec |
| Distribution block fail | 8 | Power delivery out of spec |
| PI Baseplate fail | 8 | Power delivery out of spec |
| Cabinet fans failed | 8 | Cooling failure affects hardware longevity |
| Non-Entron network equipment fail | 8 | Network equipment issue |
| Diode fail | 6 | Power delivery out of spec |
| Media converter fail | 6 | Power delivery out of spec |

**Slight tier (controls 10 pts of the site score):**

| Check | Weight | What it means |
|---|---|---|
| Temperature out of range | 4 | Environmental concern |
| AC voltage out of range | 3 | Minor electrical concern |
| Enclosure not clean | 3 | Long-term reliability |
| Filter not properly installed | 3 | Air quality / longevity |

---

### Domain subscores (0–100 each)

The report also breaks the score down by six domains. Each domain score is independent — it is the weighted failure rate within that domain, scaled ×2 and capped at 100:

| Domain | What it covers |
|---|---|
| **Controllers** | Controller LED status, I/O module status |
| **Network** | Network status flags, switches (Entron and other) |
| **Power** | All voltage readings, power supplies, distribution blocks, diodes, baseplates |
| **Cabinet Condition** | Cabinet fans, ground inspection |
| **Environmental** | Temperatures, cleanliness, filters |
| **Node Maintenance** | Performance index, free time |

Domain scores let you see *where* the risk is concentrated without having to read through all the individual findings.

---

## Critical Issue Hard Cap

Regardless of site size, any **critical issue** (controller LED fault, I/O failure, network failure, Entron switch failure) applies a hard penalty that bypasses the normalization:

- **Each critical issue deducts 20 points flat** from the final site score.
- **The score is also capped at 79** whenever any critical issue exists — this forces the badge to WARNING or lower, so a critical fault can never produce a GOOD or ADVISORY result no matter how large the site.

**Example — Dominion 26-cabinet site:**
- Normalized score (rate-based) = 93
- 1 critical issue → cap to 79, then subtract 20 → **final score = 59 (MODERATE)**

This means critical issues are always visible in the score and badge, even on large sites with hundreds of healthy components.

---

## The Status Badge

The badge is driven by the final site score (after the critical cap is applied):

| Badge | Score Range | Color |
|---|---|---|
| **GOOD** | 95 – 100 | Green |
| **ADVISORY** | 75 – 94 | Purple |
| **MODERATE** | 50 – 74 | Orange |
| **WARNING** | 25 – 49 | Amber |
| **CRITICAL** | 0 – 24 | Red |

Because critical issues cap the score at 79 and subtract 20 per issue, a single critical finding always lands in MODERATE or lower. Two critical issues land in WARNING or lower.

---

## Why a low score with a MODERATE badge makes sense

**Example:**
- 308 components assessed, 22 failed (7.1% failure rate)
- 0 critical findings, 27 moderate findings, 24 slight findings
- Status badge: **MODERATE** (because moderate findings exist)

The site score depends on what those 22 failures were. If most of them are in the moderate tier (power hardware, fans, etc.), the moderate tier contribution is: 20 pts × min(1, moderate_failure_rate × 2). At a low failure rate this might produce 5–10 points. Critical tier contributes 0 (no critical issues). Slight tier adds a few more. Score ends up in the 10–20 range.

This is correct: the site has real problems that need work orders, but the bulk of it is functioning normally. The badge tells operations there is something to act on; the score tells them the scale is contained.

---

## Inspection Coverage

The report shows how many check-points were completed vs. expected:

- For cabinet inspection items (LEDs, fans, cleanliness, etc.), the expected count is **one per cabinet per check category** (8 categories × number of cabinets).
- For components (power supplies, diodes, etc.) and nodes, every submitted item counts as complete.

Coverage below 100% means some inspection fields were left blank on one or more cabinets. Lower coverage means the score is based on less data and should be interpreted with that in mind.

---

## Summary

| Concept | What it means |
|---|---|
| Score is rate-based | Big sites and small sites are comparable |
| Tier-blended (70/20/10) | Controller faults always control up to 70 points — they can't be diluted by a large site |
| ×2 display scale | 50% failure rate within a tier = that tier's full allocation |
| Critical hard cap | Each critical issue deducts 20 pts flat and caps score at 79 — never washed out by site size |
| Badge is score-driven | Determined by the final score after the critical cap is applied |
| 6 domain scores | Shows which area of the site is driving the risk |
| Coverage | Shows how complete the inspection data is |
