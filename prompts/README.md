# Creative Engine System Prompts

A modular system prompt suite for turning Metrix creative briefs into
platform-ready creative, and for handing that creative over so the recipient
understands it and can act.

## Design

**Modular, not monolithic.** One core prompt sets identity, rules and sources of
truth. Stage modules and format modules load on top. A static-only job does not
carry video instructions it will never use.

**Evergreen by reference.** None of the prompts name a model id or parameter.
They point to the dated references in `skills/metrix-ad-creative/references/`.
When Kie changes a model, you update one routing table, not eight prompts.

**Restrictive only where it matters.** Nine rules, each with its reason, protect
test validity, product truth and spend. Everything else is a default the model
may override with a stated reason, or craft left to its judgment.

**Inspectable in the middle.** The render spec is the visible translation layer
between brief and generation. It is where expectations get set and approved
before credits are spent.

## Files

| File | Answers |
| --- | --- |
| `00-core.md` | Always loaded: role, rules, defaults, source hierarchy, evidence labels |
| `01-brand-intake.md` | **Q2:** how brand kits, logos, product imagery and website context get incorporated |
| `02-render-bridge.md` | **Q3:** how the brief becomes platform-optimised prompts through the render spec |
| `03-handoff.md` | **Q1:** how files and rationale are presented so the user understands the why |
| `formats/static.md` | Single-image statics |
| `formats/ugc.md` | UGC and AI-UGC, including disclosure |
| `formats/video.md` | Video, still-first workflow |
| `formats/carousel.md` | Carousels as one system |

## Assembly

System prompt = core + stage + one format module per `asset_type` in the brief.

```
00-core.md
+ 01-brand-intake.md | 02-render-bridge.md | 03-handoff.md
+ formats/<asset_type>.md
```

In a single long session, load all three stages at once and let the core's
stage table route between them. In a pipeline, load one stage per call.

Relative `references/...` paths in the prompts resolve to
`skills/metrix-ad-creative/references/`.

## Variables to inject

| Variable | Stage | Value |
| --- | --- | --- |
| `{{brief_json}}` | Intake | One brief object or `creative_briefs.json` |
| `{{client_library_json}}` | Intake | `local_client_library.json` |
| `{{brand_kit_files}}` | Intake | File list or URLs: guidelines, logo, product photos |
| `{{website_url_or_capture}}` | Intake | URL, or captured page text with its date |
| `{{audience}}` | Handoff | `strategist`, `media_buyer` or `client` |
| `{{first_handoff}}` | Handoff | `true` adds the "How this works" primer |

## Artifacts the pipeline produces

| Artifact | Produced in | Purpose |
| --- | --- | --- |
| `brand_translation.json` | Intake | Brand turned into prompt language once, reused everywhere |
| `render_spec.json` | Render bridge | Exact model, parameters, prompts and references. Reproducible |
| `assets/` | Render bridge | MST-named outputs |
| Handoff message | Handoff | Verdict, rationale, test logic, QA, next step |

## Recommended brief addition

The current `metrix-brief-builder` schema has no place for brand assets, so the
intake stage has to collect them separately. Adding an optional block to each
brief removes that step and makes the brief self-contained:

```json
"brand_assets": {
  "design_system_code": "DS_02",
  "product_references": [
    { "file": "bottle_front.png", "view": "front", "role": "product" },
    { "file": "bottle_label.png", "view": "label detail", "role": "product" }
  ],
  "logo": { "file": "logo.svg", "method": "composite_in_post", "clear_space": "upper right" },
  "style_references": [],
  "website_context": { "url": "", "captured_on": "" }
}
```

This is a proposal. It changes the brief-builder's output contract, so update
`references/io-schema.json` in that skill in the same change.
