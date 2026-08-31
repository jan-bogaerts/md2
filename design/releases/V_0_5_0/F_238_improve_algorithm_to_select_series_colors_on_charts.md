---
author: 
id: F_238
internalId: 2e5a2329-ae2b-4afa-9d93-7d77c7b25b89
title: improve algorithm to select series colors on charts
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__2e5a2329-ae2b-4afa-9d93-7d77c7b25b89.json
policy:
after: c8999726-4f9a-4963-ba9b-7c32b2190156
---

* make certain that the same color isn't picked 2 times
* lets make a hardcoded list of colors that differ enough from each other

## Current state

`StatsBarChart` hashes each effective series identity (`seriesIdentity`, or `identity` when no series identity exists) and uses the hash modulo the eight-color `theme.palette.custom.chartPalette`. Different identities can therefore resolve to the same palette index. Legend swatches and bars calculate the hash separately but use the same rule.

Light and dark themes already provide separate hardcoded chart palettes. All Stats charts use `StatsBarChart`; dataset builders provide identities and labels but do not select colors.

## implementation details

* Replace hash-based selection in `stats_bar_chart.tsx` with one color map per rendered `StatsBarChart`.
* Collect distinct effective series identities in display order. Assign each identity the next unused color from `theme.palette.custom.chartPalette`.
* After all prepared palette colors are assigned, generate random CSS colors. Reject a generated color when its normalized value already exists in the chart's color map; retry until an unused color is found. Here, **unused** means no other effective series identity in the same `StatsBarChart` has the same CSS color value. Generated overflow colors need not meet a numeric perceptual-distance threshold.
* Memoize allocation by ordered identity set and active theme palette. Value-only row updates must not change colors; adding, removing, or reordering series may rebuild the map. A light/dark theme change must rebuild it from that mode's prepared palette.
* Use the shared map for legend swatches and bar segments. Do not change `StatsChartRow`, dataset aggregation, CSV output, or Electron code.
* Keep prepared light and dark lists in `app_theme.ts`. Their colors must remain visibly distinct against their chart background; generated colors are only overflow after these lists run out.

## acceptance criteria

* Two distinct effective series identities rendered by one `StatsBarChart` never receive the same CSS color, including when visible series outnumber prepared palette colors.
* Every occurrence of one effective series identity in that chart uses one color in bars, stacked segments, and legend.
* Prepared palette colors are assigned before any random color is generated, without hash collisions.
* Colors remain unchanged when the component rerenders with the same ordered identity set and theme palette.
* Changing theme mode uses that mode's prepared palette and rebuilds overflow colors.
* Separate `StatsBarChart` instances allocate independently; duplicate colors between separate charts are allowed.
* Component tests cover prepared-color uniqueness, overflow generation, generated-color collision retry, legend/bar agreement, and stable colors across value-only rerenders.
* `npm run test:unit` and `npm run lint` pass in `app/`.
