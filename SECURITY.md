# Security

SPOT is a research prototype that runs on simulated data. This file sets out what is protected today and what must happen before real health data is used.

## What the app does today

- **No secrets in the app.** The app holds no API keys. Anything prefixed `EXPO_PUBLIC_` is compiled into the app and readable by anyone, so it must never hold a secret.
- **No health data leaves the device by default.** Ask is a dentist-messaging demo with automated replies, not a connected healthcare service. Conversations are held in memory and reset on reload. Replies run on-device. Data is only sent if `EXPO_PUBLIC_CHAT_URL` is set, and then only a compact, de-identified summary (no name, email or device IDs).
- **Network policy.** The chat endpoint must use HTTPS. Plain HTTP is accepted only in development builds, and only to `localhost` or a private LAN address (10.x, 172.16–31.x, 192.168.x). Requests time out after 20 s and replies are validated and length-capped. On any failure the app falls back to the on-device assistant.
- **Untrusted input.**
  - Deep-link parameters are validated before use: a tooth must be 1–32, a biomarker must be one of the six known IDs, and an unknown scan ID falls back to the latest scan.
  - Text inputs are length-limited (chat 1,000 characters, search 60).
- **No persistence.** The demo keeps everything in memory, with no local database or files.

## Chat server (`server/`)

- **API key.** The key is read from `ANTHROPIC_API_KEY` on the server only. `.env` files are git-ignored.
- **Network exposure.** It binds to `127.0.0.1` by default. Set `HOST=0.0.0.0` only on a trusted network or behind an HTTPS reverse proxy.
- **Authentication.** With `CHAT_TOKEN` set, requests need `Authorization: Bearer <token>`, compared in constant time. A token embedded in the app is not secret; it is a speed-bump against casual abuse. Real deployments need per-user authentication (below).
- **CORS.** Off unless `ALLOWED_ORIGINS` lists browser origins. Native apps don't need it.
- **Abuse limits.**
  - Per-IP rate limit (`RATE_LIMIT`, default 20 per minute).
  - 32 KB body limit and strict JSON validation: questions up to 1,000 characters, history up to 10 turns, context up to 16 KB.
  - Request and header timeouts.
- **Response hardening.** Security headers (`nosniff`, `no-store`, `no-referrer`) and generic error messages.
- **Logging.** Only error classes are logged, never request bodies or health data.
- **Prompt injection.** User data is wrapped as data, and the model is told to ignore instructions inside it.

## Dependencies

`npm audit` reports 0 vulnerabilities for both the app and the server. A transitive `minimatch` used by Expo's build-time fingerprint tool is pinned to a patched version via `overrides` in `package.json`.

## Required before using real patient data

These are out of scope for the demo, but must be done before production:

1. **User accounts and per-user authorisation** on every backend call, for example short-lived tokens issued after sign-in, instead of a shared `CHAT_TOKEN`.
2. **Encryption at rest** for any stored readings (iOS Data Protection / Keychain via `expo-secure-store` for keys) and TLS everywhere.
3. **Regulatory review.** HIPAA (US) / GDPR (EU) obligations, a data-processing agreement for any third-party processing (including the LLM provider), data retention and deletion, and an audit log of access.
4. **BLE pairing security** for the scanning case: authenticated pairing, signed firmware, and validation of every packet from the device.
5. **Payments** through a PCI-compliant provider (Apple/Google in-app purchase or Stripe). The Strips tab currently places no real orders.
6. **App hardening:** certificate pinning for production endpoints and a dependency-update policy, with `npm audit` run in CI.

## Reporting

Please report suspected vulnerabilities privately to the repository owner rather than in a public issue.
