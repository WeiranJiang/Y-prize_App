# OraCare — localized oral health monitoring (prototype)

OraCare is the app for the SPOT (Submillimeter Polymer Optical Transmitter) system: a sensing strip in a clear retainer, an optical scanning case, and this app. Built with Expo (SDK 58) + Expo Router + expo-gl/three.js. **All data is simulated demo data.**

## Web demo

[Open the OraCare demo](https://enamelytics.vercel.app/)

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
| **Overview** | Whole-mouth summary: share of readings in range, direction of travel, upper vs lower, a tile per biomarker, last recorded scans and month/year scan activity calendars |
| **Ask** | Melissa Pike dentist message drafts plus a separate chatbot for faster answers; dentist delivery is not connected |
| **Strips** | Strips in use, spares at home, automatic (subscription) or manual reordering, order history (demo, no payments) |

Other routes: `/profile` (icon on Home), `/strip` (strip health), `/compare`, `/scan-details`, `/about`.

## Ask: optional Claude backend

The Ask tab separates message drafts for Melissa Pike from automated OraCare chatbot answers. No clinician receives messages and no appointments or prescriptions can be requested. Conversations reset on reload. Demo replies run on-device from the app's own rules and data. To use Claude instead, run the small server in `server/` and point the app at it. The API key stays on the server, never in the app:

```bash
cd server && npm install && ANTHROPIC_API_KEY=... npm start
EXPO_PUBLIC_CHAT_URL=http://<host>:8787/chat npx expo start
```

The app sends the question, recent turns and a compact, de-identified summary of the readings. The server calls `claude-opus-5-5` at low effort with a bounded output budget. If the server can't be reached, the app falls back to the on-device assistant.

## Design system (`src/theme/tokens.ts`, `src/components/ui.tsx`)

Neutral, clinical dark UI: background `#0A0A0A`, surfaces `#141414` / `#1A1A1A` / `#242424`, borders `#303030`, text `#F5F5F5` / `#989898` / `#696969`. Sensor colours identify chemistry; status colours are paired with a reading label: green `#39A76D` (in range), amber `#D6A34A` (borderline), red `#E05252` (needs attention). SF Pro (system font) with tabular numbers. 8-pt spacing, 12–18px radii, flat surfaces, no shadows. Primary buttons are white with black text, and selection controls are iOS-style segmented controls. Charts use thin white lines, status-coloured markers, a shaded research range and touch-to-inspect.

Key screens: Home dashboard, `/biomarker?id=` (biomarker detail with 1D/7D/30D/90D history and per-location list), `/tooth?u=` (tooth-level schematic with measurement locations and readings).

## Arches and biomarkers

The upper retainer has 78 measurement sensors plus 2 chemical reference spots; the lower has 80 plus 2. The Upper/Lower toggle is global: every screen follows it, and one case readout scans both strips.

The main 3D and tooth-chart maps identify sensor chemistry: **pink ammonia, green pH, blue calcium, yellow fluoride, purple aMMP-8**. Hollow rings identify chemical reference spots. These colours do not encode health status; reading labels and status badges do.

## Biofouling & strip replacement (`src/domain/fouling.ts`)

Three independent signals, each with a configurable limit:

1. **Optical clarity**: mean transmission of chemically inert reference spots. They carry no chemistry, so dimming means film on the strip, not a change in the mouth.
2. **Local signal loss**: per-site transmission and SNR. Sites below the SNR floor are withheld from results, never estimated.
3. **Use period**: days since install and session count.

The forecast fits `log(clarity) = −k·h` (h = in-mouth exposure hours, estimated from time out of the case) over the last 8 scans. It projects when clarity crosses the replacement limit, converted to sessions (median exposure per session) and days. The states are Good → Monitor → Replace soon → Replace now, and the app reports which limit is binding. Fouling also widens each reading's uncertainty, and the app compares the fouling rate with the previous strip.

## Insight engine (`src/domain/insights.ts`)

Rule-based (R1–R8). Each insight records its rule, biomarker, sites, threshold or criterion, quality and confidence, and keeps **Observed / Interpreted / Recommended** separate. No rule diagnoses decay or gum disease.

## 3D (`src/three/`)

`retainerGeometry.ts` builds ~24k points procedurally from anatomical crown dimensions along a parabolic arch: superellipse cross-sections, cusps, incisal edges and a scalloped gingival skirt. `regions.ts` colours only each sensor's measured footprint, with a soft fall-off and a dotted boundary ring. Uncalibrated sensors still have mapped locations, without clinical values. `RetainerView.tsx` handles drag rotation with inertia, pinch and wheel zoom, double-tap reset, tap picking, camera focus, the floating label and shared cameras for comparisons.

## Extending to new biomarkers

Add or enable an entry in `src/domain/biomarkers.ts` (units, bands, limitation text) and list it in a strip's `supported` array. Modes, legends, trends and rules key off the registry. aMMP-8 locations are included, with calibration deliberately unconfigured.

### Ask security and deployment

The assistant answers general questions and uses supplied demo readings for personal insights. Offline answers are a limited rule-based guide. The composer allows 1,000 characters (the server accepts up to 2,000); server requests to 32 KiB and 10 history turns. Live requests time out, and failures clearly switch to the offline guide.

The backend allows 10 requests/minute and 100/day per socket IP, 1,000/day globally, and 5 concurrent requests. Rejected requests return HTTP 429 and `Retry-After`. Limits are in memory and reset on restart. Multiple replicas require a shared gateway/Redis limiter. Behind a reverse proxy all users share the proxy IP unless the gateway enforces trusted per-user limits; arbitrary forwarded headers are intentionally ignored. The client also limits rapid submissions, but the server is the enforcement boundary.

Set `CHAT_ALLOWED_ORIGINS` to a comma-separated list of exact web origins (e.g. `https://spot.example.com`). The `ALLOWED_ORIGINS` alias is also accepted. Optional `CHAT_TOKEN` bearer validation and the localhost default bind from the existing backend are preserved; set `HOST=0.0.0.0` behind your HTTPS gateway. Browser origins are denied by default; native clients do not send Origin. CORS is not authentication: this prototype has no user accounts. Before exposing private user records or running a public paid service, add verified user authentication and shared per-user quotas at your gateway. Do not put shared backend secrets in `EXPO_PUBLIC_*` variables. Use HTTPS for deployment; HTTP is allowed in development only. Health questions and summaries are sent to the model provider when live chat is configured; avoid entering identifying details. Request bodies and upstream errors are not logged by this server. Keep proxy access logs free of bodies and enforce request-size/time limits there too.

Server checks: `cd server && npm run typecheck && npx tsx --test security.test.ts`.

## Share a web demo on Vercel

Import [this repository into Vercel](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FWeiranJiang%2FY-prize_App). Choose the repository root, then deploy. `vercel.json` sets the Expo web export command, `dist` output, SPA route fallback, and security headers. Vercel supplies a shareable HTTPS URL after deployment. For a project already connected to this repository, the next deployment picks up these settings automatically.

The hosted demo uses simulated readings and the offline Ask guide by default. The optional Node chat server is a separate service; this static deployment does not run `server/index.ts`. To enable model-generated demo replies, deploy that service separately, set `EXPO_PUBLIC_CHAT_URL` to its HTTPS `/chat` endpoint in Vercel before building, and allow your Vercel site's exact origin in the backend's `CHAT_ALLOWED_ORIGINS`.

## Automatic scan history

Manual scan screens, buttons, timers and scan simulations have been removed. The app displays recorded readouts; live case/BLE syncing is not yet wired into this prototype. The existing demo history stays simulated and does not generate new scans in the background.

Overview shows the latest upper and lower readouts, a month calendar and a horizontally scrollable GitHub-style year calendar. Tap a small activity square to see its daily session count. Latest readout details remain available in Last recorded scans. Activity colours show sessions per day, not dental health; paired upper/lower records within the same minute count as one session. Calendar days follow the device’s local timezone.

## Food Log

The Log tab saves a short food/drink name, approximate eating/sipping duration, and optional sugar, possible acidity and sticky-texture notes. No calories, macros, weight or other nutrition metrics are collected. Entries can be edited, deleted (with Undo), or reused for a quick repeat. They are stored locally on the device using AsyncStorage, separately from the simulated sensor data. Browser/app storage deletion removes the log; there is no account or cross-device sync. A compressed JPEG preview (up to 480 pixels on its longest edge, bounded to 250,000 characters) is saved locally with photo entries. Entry cards show a slightly zoomed crop, the recorded sugar/acid/texture summary and reader notes or assumptions. Full-resolution photos are not stored.

The web demo needs **no API key**: meal-photo suggestions use an on-demand MobileNet classifier, and nutrition-label photos use Tesseract OCR in the browser. Readers load on demand; the OCR worker, English language data and engine are bundled as self-hosted assets during the web build, while meal model weights download from TensorFlow Hub. Images are not uploaded. Meal identification is limited to recognizable food classes, not a full meal/ingredient analysis; unknown or low-confidence results ask the user to type a name. Sugar, actual acidity and hidden ingredients cannot be established from appearance. Label extraction reads explicit sugar/acid-ingredient evidence and always requires user review. This does not establish measured pH or diagnose tooth damage.

Camera capture and gallery selection work with the browser/OS photo picker. On desktop, Take photo may open the file chooser when no camera capture picker is available. Native builds support manual logging and image selection, but automatic photo suggestions currently run in the web demo only. The image-picker config plugin disables microphone permission and supplies camera/photo permission descriptions.

## Sensor placement specification

`src/domain/sensorLayout.ts` is the single source of truth for the supplied Universal-number table. It includes 8 ammonia, 6 pH, 16 calcium, 112 fluoride and 16 aMMP-8 measurement sites, plus 2 K⁺ and 2 aMMP-8 background references: **162 physical SPOTs**. No wisdom teeth are covered. Every covered tooth has all four fluoride corners. Shared contact sites are stored once and associated with both neighbours. A contact is mesial/distal relative to the tooth being viewed, not assigned to a second independent reading.

`src/domain/sensorGeometry.ts` places chemical and contact sensors at mid-crown; aMMP-8 and its background references are at the palatal/lingual gum margin, above the gum line. Small within-zone offsets separate adjacent chips at shared locations; marker sizes and the tooth geometry are schematic, not manufacturing CAD dimensions. Coincident sites at different crown heights use concentric filled markers in the top-down chart; the 3D view retains their distinct heights. Exact surface names and contact pairs are retained in site labels and the editable CSV at `docs/sensor-layout.csv`.

aMMP-8 has no invented unit, numerical reading, range or clinical classification. It is shown as **Not calibrated** and excluded from signal-failure/strip-usability conclusions. Existing pH/mineral/ammonia demo values remain simulated. The older optical clarity controls are internal synthetic inputs to strip-health forecasting; they are not counted or rendered as extra hardware SPOTs and are separate from the four specified chemical references. No potassium/background correction is claimed without actual calibration data.

Verify mapping with `server/node_modules/.bin/tsx --test server/sensorLayout.test.ts`.
