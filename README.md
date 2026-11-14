# SPOT — localized oral health monitoring (prototype)

Mobile app for the SPOT (Submillimeter Polymer Optical Transmitter) system: a sensing strip in a clear retainer, an optical scanning case, and this app. Built with Expo (SDK 58) + Expo Router + expo-gl/three.js. **All data is simulated demo data.**

## Run

```bash
npm install
npx expo start          # Expo Go / dev build (iOS, Android)
npx expo start --web    # browser
npm run typecheck
```

## Screens

| Tab | What it does |
|---|---|
| **Home** | Interactive point-cloud retainer with localized pH regions, summary cards, strip health, insights, recommendations |
| **Scan** | Prepare → wear timer → place in case → optical scan (beam sweep, staged progress) → results / retry |
| **Explore** | Mode switch (pH active; lactate/calcium research, others planned), 3D tooth focus, arch map, tooth search (Universal/FDI), per-site detail, research view with sensor-level data |
| **Trends** | Time/biomarker/location filters, per-site small multiples (never averaged), neighbouring-site comparison, persistent sites, reliability, link to 3D before/after compare |
| **Profile** | Case & strip, numbering, consumer/research mode, protocol, configurable pH thresholds and strip limits |

Other routes: `/strip` (strip health), `/compare`, `/scan-details`, `/about`.

## Biofouling & strip replacement (`src/domain/fouling.ts`)

Three independent signals, each with a configurable limit:

1. **Optical clarity**: mean transmission of chemically inert reference spots. They carry no chemistry, so dimming means film on the strip, not a change in the mouth.
2. **Local signal loss**: per-site transmission and SNR. Sites below the SNR floor are withheld from results, never estimated.
3. **Use period**: days since install and session count.

The forecast fits `log(clarity) = −k·h` (h = in-mouth exposure hours, estimated from time out of the case) over the last 8 scans. It projects when clarity crosses the replacement limit, converted to sessions (median exposure per session) and days. The states are Good → Monitor → Replace soon → Replace now, and the app reports which limit is binding. Fouling also widens each reading's uncertainty, and the app compares the fouling rate with the previous strip.

## Insight engine (`src/domain/insights.ts`)

Rule-based (R1–R8). Each insight records its rule, biomarker, sites, threshold or criterion, quality and confidence, and keeps **Observed / Interpreted / Recommended** separate. No rule diagnoses decay or gum disease.

## 3D (`src/three/`)

`retainerGeometry.ts` builds ~24k points procedurally from anatomical crown dimensions along a parabolic arch: superellipse cross-sections, cusps, incisal edges and a scalloped gingival skirt. `regions.ts` colours only each sensor's measured footprint, with a soft fall-off and a dotted boundary ring. Withheld sites are slate, never "healthy". `RetainerView.tsx` handles drag rotation with inertia, pinch and wheel zoom, double-tap reset, tap picking, camera focus, the floating label, the scan-beam mode and shared cameras for comparisons.

## Extending to new biomarkers

Add or enable an entry in `src/domain/biomarkers.ts` (units, bands, limitation text) and list it in a strip's `supported` array. Modes, legends, trends and rules key off the registry. aMMP-8 is intentionally excluded.
