# Stage 6: Mandatory production review for UGC and video

This stage governs `kie_render_ugc` (including AI-UGC briefs) and
`kie_render_video`. Read `kie://production-review-standard`, sourced from
`docs/UGC_PRODUCTION_STANDARD.md`, for the canonical review-record schema,
acceptance criteria and local validation command. Do not substitute a successful
provider job or a brief-input verdict for finished-asset acceptance.

## Produce an intentional edit

Keep the accepted performance and useful existing footage. A duration maximum
is a ceiling, not a slot to fill. Shorten unnecessary copy and pauses before
forcing speech into a length. Preserve natural vocal pace, emphasis and level;
never retime visible lips independently of their speech. Record any B-roll
playback-speed change, source/output ranges and why it helps. Judge the export
at normal playback speed, not a sped-up preview.

Make an explicit background-music decision. When music supports the message,
use a suitable rights-cleared bed, retain source and license evidence, duck it
under the voice, use intentional entry/exit fades and preserve separate stems.
A dry decision needs a specific creative reason and review evidence. Music
cannot conceal a defective performance or reduce speech intelligibility.

Refine each cut and transition around the viewer's next useful thought. Keep
captions grammatical and readable, preserve word tails, and give the CTA enough
time to be understood. Extra effects, cuts and higher playback speed are not
proof of retention or conversion improvement.

Use B-roll that adds evidence or context. Inspect actual moving source ranges
for identity, anatomy, interactions, motion, continuity, framing and adequate
usable duration. A sharp still, a model label or an upscale is not evidence of
good motion. Reuse accepted material first; generate only for a named quality
defect or a missing shot with a bounded cost and clear acceptance criteria.

## Five gates before approved client presentation

All five are mandatory, separate verdicts bound to the current final master
and review-context SHA256 values:

1. `iap_variables`: Verify canonical IAP code membership and brief alignment,
   plus measured technical variables and documented playback/speed mappings.
2. `communications`: Check the actual spoken and visible message, supported
   claims, hook, useful progression, offer and one clear action.
3. `sound_check`: Run the "12-Year-Old Sound Check" as a plain-language
   comprehension exercise: listen at 1x and paraphrase the meaning and action.
   Also check phone-size captions and the sound-off message. This name does not
   mean a child or a human actually reviewed it; record who did what.
4. `editorial_peer`: An editorial colleague independent of the operator and
   author inspects the complete actual export and gives actionable findings.
   State whether the reviewer is a human or an agent.
5. `blind_review`: A separate fresh reviewer receives the neutral creative
   brief and exact final asset without production history, prior feedback,
   model, cost or author identity. Record what was masked and what the creative
   itself necessarily reveals; do not claim complete blinding where impossible.

Failed, pending, unavailable or stale-hash evidence blocks approved client
presentation. Internal previews may continue only when clearly labeled with
their pending gates. Continue independent preparation and repairs inside the
existing authorization; do not ask for routine permission at every render.
Preserve required human listening decisions before dependent lip-sync spend.
Never turn an agent's frame check, ASR result or numerical measurement into a
claim of human listening or normal-speed playback acceptance.

The local validator checks evidence completeness, binding and release
eligibility. It cannot perceive quality, create a review, or enforce a provider
budget or API-side release block. Any final media or relevant context change
requires new evidence for the affected gates before presentation.

Keep this workflow, its fixtures and reusable reports anonymous and evergreen.
Use neutral IDs and generic roles rather than client, industry or niche cases.
Private creative assets retain the product truth required by their approved
brief; anonymization is not permission to fabricate or remove that evidence.
