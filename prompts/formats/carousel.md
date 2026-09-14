# Format: Carousel

## Premise

A carousel is one system shown in several frames, not several separate images.
If the cards do not visibly belong together, the format loses its advantage.
Card one does the stopping; the rest reward the swipe.

## Lock across every card

- Model, ratio (1:1 by default), resolution and seed where exposed
- Light, palette and style clauses, verbatim from the Brand Translation Sheet
- Product references, in the same order
- Environment family: same world, varied framing

Write one carousel base. Each card gets a card clause, not a new prompt.

## Card roles

Take the sequence from the brief's `copy_architecture` structure, expressed
visually. The copy itself stays in Ads Manager card fields.

| Card | Typical visual job |
| --- | --- |
| 1 | Hook: the strongest single image, readable alone |
| Middle | Problem, mechanism, product detail, proof: one idea per card |
| Last | Product clearly shown, space for the CTA field to do its job |

Use the brief's order when it gives one. This table is a fallback.

## Continuity

- **Consistent system (default):** shared base, varied framing, shared palette.
  This is reliable.
- **Seamless panorama across cards:** only possible by generating one wide image
  and slicing it. Model ratios cap how many square cards that can cover, so
  check the routing table's widest ratio first, and flag the limit if the brief
  wants more cards than the ratio allows.

## Matrix mode

Decide which card carries the isolated variable. If the test is the hook, only
card one changes across the row, and every other card is byte-identical across
cells. If the whole sequence changes per cell, the row tests the concept, and the
handoff must say so.

## QA checks to add

- [ ] All cards reviewed side by side in order, not one at a time
- [ ] Palette and light visibly consistent across cards
- [ ] Product matches reference on every card it appears on
- [ ] Card one reads alone at thumbnail size
- [ ] Card count and order match the brief
