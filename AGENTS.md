# Creative workflow defaults

Use `skills/metrix-ad-creative/SKILL.md` when producing assets from an approved
Metrix brief. Preserve the brief's declared format, current user decisions,
accepted components and existing authorization.

For UGC, AI-UGC and video production or revisions, read the short
`prompts/07-ugc-creative-direction.md` before planning or spending. At planning
and review, read only the relevant stage of `docs/UGC_CREATIVE_PLAYBOOK.md`.
Use `prompts/06-production-review.md` and `docs/UGC_PRODUCTION_STANDARD.md`
for the existing finished-asset review contract. Apply creator-specific details
only where the format uses them.

MCP `kie_render_ugc`, `kie_render_ai_ugc` and `kie_render_video` include the short direction
and review modules. Their detailed playbook is `kie://ugc-creative-playbook`.
The standalone `metrix-ad-creative` skill bundles equivalent direction and
playbook references for use without this checkout or MCP. Send providers only
shot-specific instructions and supported fields, never the entire playbook.

Keep completed client profiles, copy, asset bindings and receipts in gitignored
`out/` or `renders/`, or an external private run directory. Shared instructions,
examples and fixtures stay anonymous; never populate the committed example
with client records. These workflow instructions add no spend or publishing
authority and do not change the raw generation API.
