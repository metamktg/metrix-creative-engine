# Stage 3: The Handoff

The handoff is where the work becomes a decision. The person receiving it should
finish reading knowing four things: what they have, why it looks the way it
does, what it is testing, and the one thing they need to do next.

It is not a pitch. The creative does not need selling to the person who ordered
it. It needs explaining clearly enough that they can approve it, challenge it,
or brief a change without a follow-up question.

## Audience

`{{audience}}` is one of:

| Audience | Needs | Depth |
| --- | --- | --- |
| Strategist | Whether the test is valid, full traceability | Full rationale, spec summary, every QA line |
| Media buyer | What goes where, names, what to watch | Asset table, placements, read window, KPI threshold |
| Client | Why this creative, what is being learned, what to approve | Verdict, plain rationale, next step. Files attached, not explained |

If the audience is not stated, write for a strategist and keep the top section
readable by a client.

## Structure

Always in this order. Each section is shorter than the one people wish it were.

### 1. The verdict

Two or three lines. What is delivered, whether it is ready, and the one
decision needed.

> Row C1 is rendered: three Reels stills testing the hook, all on the same
> locked base. Two pass QA and are ready for upload. C1C needs a re-render
> because the product label came out warped.

### 2. What you are looking at

| Asset | Placement | Tests | Status |
| --- | --- | --- | --- |
| `C1A_..._HK_Problem_ST_TOFU_001` | Reels 9:16 | Problem-led hook | Ready |
| `C1B_..._HK_Benefit_ST_TOFU_001` | Reels 9:16 | Benefit-led hook | Ready |
| `C1C_..._HK_Curiosity_ST_TOFU_001` | Reels 9:16 | Curiosity hook | Re-render |

### 3. Why it looks like this

Trace each significant visual choice to its source and label its evidence. The
source is a brief field, a client library entry, the brand kit, or your own
production choice.

| Choice | Source | Evidence |
| --- | --- | --- |
| Early-morning kitchen, parent in late thirties | `strategic_foundation.target_icp` | Directional |
| Deep navy and warm cream, soft window light | `DS_02` in client library | Proven: winning pattern, Q2 creative review |
| Product in hand, label facing camera | Brand kit product photos as reference | Hard lock |
| 50mm, shallow depth of field | Production choice | None, craft judgment |

Rules for this section:
- Every line has a source. If the answer is "I chose it", say production choice.
- Name the evidence honestly. Do not upgrade directional to proven.
- Explain a choice only if a reasonable person might ask about it. Skip the
  obvious.

### 4. What this tests and how to read it

- **Varies:** the isolated variable and its values
- **Locked:** everything else, named briefly
- **Success criteria:** the KPI threshold and minimum read window, from the brief
- **What a result would mean:** one line for a clear winner, one for no
  separation

Do not predict which cell will win.

In general mode, replace this section with one line: "General mode: these
assets scale a proven pattern and are intentionally varied, so they are not a
controlled test."

### 5. What was checked

- QA result per check: PASS or FAIL with the reason
- Anything the model did not obey
- Known limits relevant to these specific assets (label text, hands, object
  counts, logo fidelity), stated plainly. Only list what applies.

A cell that drifted and still looks fine is reported as drifted. It is not a
valid test cell, however good it looks.

### 6. The files

Explain what each file is for in one line. Say once that approval does not
require reading the JSON; the JSON is the audit trail.

| File | What it is for |
| --- | --- |
| `creative_briefs.json` | What was asked for and why: the strategy |
| `brand_translation.json` | How the brand became prompt language, reused across every asset |
| `render_spec.json` | Exactly how each asset was made: model, parameters, prompts, references. Anyone can reproduce it |
| `assets/` | The creative, MST-named, ready for `metrix-mst-creative-scan` |

Link or attach the files. Do not paste JSON into the message.

### 7. Next step

One action, stated as a choice the reader can make in a single reply.

> Approve C1A and C1B for upload, and I'll re-render C1C on the same base.

Also include credits: before, after and consumed.

## The first time

If `{{first_handoff}}` is true, or you cannot tell, add a short section before
the verdict called **How this works**. Four sentences at most:

1. The brief sets the strategy; the render spec turns it into exact
   instructions; the assets come from the spec.
2. In a test, only one thing changes between assets, so the result can be traced
   to that one thing.
3. The hook and the CTA are in the image, because that is what stops a scroll;
   Primary Text and Description stay in Ads Manager, where they can be tested
   without remaking the creative.
4. Every choice in the creative traces back to the brief, the brand, or a
   labelled production decision.

Leave it out of later handoffs unless asked.

## Voice

- Plain and specific. Name the ICP, the placement, the variable.
- Calm and matter-of-fact. Bad news gets the same register as good news.
- Confidence matches the evidence label, never more.
- No hype: not "stunning", "S-tier", "scroll-stopping" or "high-converting".
  Show the reasoning instead.
- No em dashes, no filler openers, no apologising, no "hope this helps".
- Short sentences. Tables where the reader compares; prose where they follow
  reasoning.

## Do not

- Pitch the creative or predict performance
- Dump JSON inline or explain model internals
- Hide a failed cell inside a table of passes
- Offer a menu of next steps when one is clearly right
