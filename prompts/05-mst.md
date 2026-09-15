# Matrix Sprint Test

## What it is, and what it is not

A Matrix Sprint Test is a **deliberate sprint to validate a hypothesis**. You run
one when you want an answer: does this angle work, does this avatar exist, is
there product-market fit in this position.

**It is not a stage of the loop.** The loop runs analysis, strategy and creative
whether or not an MST is in flight, and most accounts will not have one running
at any given moment. An MST is something you choose to start, in the background,
when a question is worth paying to answer.

**It is optional.** It is also the sharpest instrument the product has, which is
why it gets confused for a mandatory step. Both things are true.

## The naming rule, which applies everywhere else too

**Never refer to creative by its coordinate.** Not in analysis, not in strategy,
not in a report, not in a filename outside a live matrix.

A fresh account has no matrix. Until one runs, `C1A`, row A and column 2 refer
to nothing, and putting them in an analysis is describing an account in terms of
a test that never happened.

Even inside a running MST, a coordinate is an index, not a name. What you report
is the **descriptor**: the variable, the angle, the concept. "Problem-state hook
on busy parents" is a finding. "C1A won" is a lookup someone else has to
perform.

The one place the coordinate belongs is the filename of an asset in a live MST,
because `metrix-mst-creative-scan` parses it to attribute results. That is
machine addressing, not how you talk about the work.

## When to run one

Run an MST when there is a real question and the answer changes what you do:

- A new account with no proven angle, and spending blind is more expensive than
  testing.
- A plateau: the current winner has stopped scaling and you need the next axis.
- A new product, market or avatar hypothesis nobody has evidence for.
- A strategic claim someone believes strongly and nobody has measured.

Do **not** run one to look busy, to fill a content calendar, or because the
account is new and the matrix is the thing you know how to build. A test with no
question attached produces data nobody acts on.

## Building one when the account has data

This is the better case, and it earns a higher standard of construction. Do not
build the matrix from the account's data alone: performance data tells you what
happened inside the account, not what is true in the market.

**1. Read the account properly.** Winners and losers, but specifically what
separates them: which variables co-occur with the wins, which audiences the wins
concentrate in, which angles have never been tried rather than tried and failed.
An untested angle and a failed angle look identical in a summary and mean
opposite things.

**2. Go and look at the market.** This is the part usually skipped:

- **The brand's own site.** What it actually claims, how it positions, what the
  product truly is. Reverse-search the domain.
- **Competitors' live ads.** Meta's Ad Library (`facebook.com/ads/library`) is
  public and searchable by advertiser. Read what the category is actually
  running: the hooks, the formats, the offers, what everyone says and therefore
  what nobody is saying.
- **The category's language.** How customers describe the problem in their own
  words, which is rarely how the brand describes it.
- **Longevity as evidence.** An ad a competitor has run for months is a
  competitor's paid-for finding. Free evidence.

**3. Form the hypothesis, then build the grid around it.** The matrix is
downstream of the question. Rows and columns exist to isolate the variable the
hypothesis is about. A grid built first and rationalised afterwards tests
whatever happened to be convenient.

**4. Size it honestly.** Every cell needs enough budget and time to reach a
readable signal. A matrix too large for the budget produces cells that each say
nothing, which is worse than a smaller matrix that answers one thing.

## Building one when the account has little or no data

No performance history is not a reason to guess. It is the case where you reason
like a strategist rather than read like an analyst, and the discipline is the
same one used to build a pitch for an account nobody has run yet.

**Derive the avatars from the product and the market**, not from the platform:

- Who has this problem acutely enough to pay?
- What do they currently do instead, and what does that cost them?
- What would make them act now rather than later?
- What do they have to believe for the product to make sense?

**Then do the market work above anyway.** With no account data, competitor ads
and category language are not supplementary, they are the whole evidence base.
Somebody in this category has already spent money learning what works, and the
Ad Library is where that shows.

**State the confidence honestly.** A matrix built from reasoning rather than
performance data is a hypothesis about a hypothesis. Label it that way, size it
smaller, and treat the first result as calibration rather than proof.

What you must not do is present derived avatars as findings. A derived avatar is
a bet. An observed avatar is a fact. The report says which it is.

## After the sprint completes

The test produces results; the results are not yet knowledge.

1. **Analyse against the hypothesis.** `metrix-mst-test-engine`: universal
   winners, avatar-specific winners, variable isolation. The question is what
   the test answered, including the case where it answered nothing, which is a
   real outcome and worth saying plainly.
2. **Convert to strategy.** `metrix-optimization-loop`: re-weight variables,
   classify Retire, Scale, Optimize, Validate, update the golden formula.
3. **Feed the next cycle.** The updated weights change the briefs the builder
   writes next, so the following round starts from what this one proved rather
   than from where the last one started.

That last step is the compounding one. A sprint whose findings never reach the
next brief was an expensive way to generate a chart.

## Common failure

Treating the matrix as the product. The matrix is an instrument for answering a
question. If nobody can state the question it was built to answer, the grid is
decoration and the spend behind it is a cost with no return.
