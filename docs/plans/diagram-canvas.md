# Plan: diagram canvas for system design

**Status:** planned, not scheduled. **Build after** prompts 11–14 have shipped and
the trigger below is met.

## What it is

A small drawing surface inside the side panel where the learner builds a system
design out of boxes and arrows (client, load balancer, API servers, cache,
queue, database, CDN, …) instead of describing it in text. The AI reviews the
diagram the same way it reviews a written Design drill answer, and curveballs
("traffic is now 10×") are answered by changing the diagram.

It's the most hands-on form of the System design mode. Drawing forces decisions
that prose lets you skip: where does the cache sit, what talks to what, where is
the single point of failure.

## When to build it

Only when both are true:

1. **People use the text version.** Design drills (prompt 11) show regular repeat use,
   for example a meaningful share of design-set learners doing more than one
   drill a week. If they don't use the text version, a canvas won't save the
   mode.
2. **Learners ask for it.** Written answers keep getting feedback like "unclear
   how components connect", or users say the text template feels clumsy.

Until then, the text template plus the "Find the bottleneck" flow rendering
(prompt 14) cover most of the value at a fraction of the cost.

## The experience (v1)

- **Where.** A **Draw it** tab inside a Design drill, next to the written
  template. Text stays available: some people think in prose, and screen
  reader users need a non-visual path.
- **Palette.** About 12 fixed component types, each with an icon and a label:
  Client, DNS, CDN, Load balancer, API service, Worker, Cache, Queue/stream,
  SQL DB, NoSQL DB, Object storage, External service. Each node can be renamed,
  given a count (for example "API × 3"), and given a short note ("Redis, 64 GB,
  LRU").
- **Edges.** Directed arrows with an optional label ("reads", "async",
  "writes 5k/s"). A dashed style means async.
- **Moving around.** Drag to move, tap two nodes to connect them, pinch or
  buttons to zoom, and fit-to-screen. The panel is about 360–420px wide, so
  that's the design target, not a desktop canvas.
- **Undo and redo,** and autosave of the draft on the device.
- **Review.** "Get feedback" sends the diagram for grading against the
  brief's rubric. Feedback can point at nodes: an issue attached to a node
  highlights it on the canvas.
- **Curveballs.** The curveball arrives, the learner edits the diagram, and the
  review compares the before and after versions ("you added a read replica but
  writes still go to one primary").

**Out of v1:** freehand drawing, free-form shapes, collaboration, export to
image, templates gallery, and the canvas on mobile.

## How it would work

**Data model: a graph, not pixels.** The diagram is stored as JSON:
`{ nodes: [{ id, type, label, count, note, x, y }], edges: [{ from, to, label, async }] }`.
The layout coordinates are only for display. The AI never sees pixels.

**What the AI receives.** The graph serialised to compact text:

```
API service "api" ×3 → Cache "redis" (reads)
API service "api" ×3 → SQL DB "orders-primary" (writes 5k/s)
Worker "mailer" ← Queue "events" (async)
```

This is cheap in tokens, easy to grade, and needs no vision model. Grading reuses
the Design drill rubric pipeline from prompt 11.

**Rendering.**
- **Drawing technology:** inline SVG built with DOM APIs (`createElementNS`),
  no `innerHTML`, so the Firefox store rule still holds.
- **No libraries:** no CDN (MV3 blocks it), and preferably no vendored diagram
  library. A small hand-written canvas (nodes, edges, drag, zoom) is realistic
  for this scope and keeps the extension small. Revisit only if interaction
  work balloons.
- **Theme:** CSS variables, so light and dark come for free.

**Storage and sync.**
- **Drafts** live in `chrome.storage.local`, keyed by drill.
- **Finished diagrams** aren't synced in v1. A drill produces feedback and a
  review-log row, as the other practice modes do. Syncing diagrams would need
  a new table and migration, so it's deferred until someone asks to see old
  drills on another device.

**Accessibility.**
- **Keyboard only:** Tab moves between nodes, Enter opens a node to edit, and
  there's an "add connection" dialog to pick the source and target.
- **Screen readers:** a live text outline of the graph, the same serialisation
  the AI gets.
- **The text template stays** a full alternative.

## Effort and risks

- **Effort:** the largest of the five system design features. Roughly 2–3× the
  Design drill: the canvas interactions (drag, connect, zoom, undo), touch
  and mouse handling, accessibility, and review highlighting. Server work is
  small, since it reuses the prompt 11 routes with a new answer shape.
- **Risk: the narrow panel.** Diagrams get cramped fast at 360px. Mitigate with
  zoom, fit-to-screen, the component count field (so "API × 3" is one node), and
  a soft cap of about 20 nodes, which is plenty for a 15-minute drill.
- **Risk: interaction bugs** (drag vs scroll, touch on laptops) eat time. Build
  the interaction layer first, with a test harness, before any AI wiring.
- **Risk: grading quality.** The AI might grade the diagram serialisation worse
  than prose, because it has less explanation to work with. Mitigate with a
  required one-line "why" note on key nodes, and by keeping the text template's
  Bottlenecks & trade-offs section alongside the diagram.

## Suggested build order (when the time comes)

1. **Graph model and serialiser,** pure functions with unit tests, reusable by
   the grading prompt.
2. **SVG canvas with a static render** from a graph: nodes, edges, theming.
3. **Interactions:** add, move, connect, rename, delete, undo and redo,
   keyboard path.
4. **Draft autosave.**
5. **Wire to the Design drill:** "Draw it" tab, send the serialised graph to
   grading.
6. **Feedback highlighting** of the nodes it mentions.
7. **Curveball before/after diff.**

Each step is shippable behind the Draw it tab, so it can stop at any point
if usage doesn't justify the next.

## Open questions

- Should a drill accept a diagram **instead of** text, or require both (diagram
  for structure, text for trade-offs)? Leaning toward: diagram, plus the
  trade-offs text section.
- Should the mobile app eventually get a view-only render of submitted
  diagrams?
- Is a fixed palette enough, or do people need a "custom component" node?
  Start fixed, and add one "Other" type if feedback asks for it.
