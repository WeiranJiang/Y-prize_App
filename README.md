brew install node# SPOT — localized oral health monitoring (prototype)

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
| **Home** | Upper/Lower toggle, biomarker filter, the interactive point-cloud retainer, one status line, dental-arch map, tooth search, insights and recommendations. Tapping a tooth (3D, arch map or search) opens the **magnifier**: a circular zoomed 3D view of that tooth with its readings. |
| **Trends** | Pick a biomarker and tap a tooth to see its current readings and history; all-sites small multiples, neighbouring-site comparison, persistent findings, measurement reliability, before/after 3D compare |
| **Overview** | Whole-mouth summary: share of readings in range, direction of travel, upper vs lower, a tile per biomarker, consistent vs watch list |
| **Ask** | Chat assistant grounded in the user's own readings (on-device by default; optional Claude backend, see below) |
| **Strips** | Strips in use, spares at home, automatic (subscription) or manual reordering, order history (demo, no payments) |

Other routes: `/scan` (tap the case chip on Home), `/profile` (icon on Home), `/strip` (strip health), `/compare`, `/scan-details`, `/about`.

## Ask: optional Claude backend

The Ask tab answers on-device from the app's own rules and data. To use Claude instead, run the small server in `server/` and point the app at it. The API key stays on the server, never in the app:

```bash
cd server && npm install && ANTHROPIC_API_KEY=... npm start
EXPO_PUBLIC_CHAT_URL=http://<host>:8787/chat npx expo start
```

The app sends the question, recent turns and a compact, de-identified summary of the readings. The server calls `claude-opus-5-5` at low effort, with server-side refusal fallback enabled. If the server can't be reached, the app falls back to the on-device assistant.

## Design system (`src/theme/tokens.ts`, `src/components/ui.tsx`)

Neutral, clinical dark UI: background `#0A0A0A`, surfaces `#141414` / `#1A1A1A` / `#242424`, borders `#303030`, text `#F5F5F5` / `#989898` / `#696969`. Colour is reserved for medical status and always paired with a label: green `#39A76D` (in range), amber `#D6A34A` (borderline), red `#E05252` (needs attention). SF Pro (system font) with tabular numbers. 8-pt spacing, 12–18px radii, flat surfaces, no shadows. Primary buttons are white with black text, and selection controls are iOS-style segmented controls. Charts use thin white lines, status-coloured markers, a shaded research range and touch-to-inspect.

Key screens: Home dashboard, `/biomarker?id=` (biomarker detail with 1D/7D/30D/90D history and per-location list), `/tooth?u=` (tooth-level schematic with measurement locations and readings), `/scan` (full-screen scan flow).

## Arches and biomarkers

Both upper and lower retainers carry a strip (28 and 15 sensing sites in the demo). The Upper/Lower toggle is global: every screen follows it, and one case readout scans both strips.

On the 3D map **only readings that need attention are coloured**: amber for borderline, red for needs attention. In-range sites stay plain white dots. Withheld readings get a gray ring, so "not measured" is never mistaken for "healthy". Biomarker identity is given by name, never by colour.

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
