# Contributing

Thanks for looking. This is a small codebase with strong constraints; the rules below keep it fast and safe.

## Setup

```sh
npm ci
npm run dev      # http://127.0.0.1:8791, proxies /api to LAUNCHPAD_URL (default http://localhost:8787)
npm test         # node --test tests/*.test.js, offline
npm run build
```

Node 20.19 or newer. CI (`.github/workflows/ci.yml`) runs `npm ci`, `npm test` and `vite build` on Node 22; a pull
request must pass it.

## Rules

- **Keep the CSP.** No inline scripts, no `eval`, no WebAssembly, no CDN scripts, no assets fetched from other
  origins. Models stay `KHR_mesh_quantization` glTF (no Draco, no Meshopt). The policy is set by the backend; see
  "Performance and CSP constraints" in the README.
- **Keep phones alive.** New geometry goes through instancing or merging; new effects must respect the quality
  governor (`src/quality.js`) and give something up at lower levels. Check draw calls with `__city.memory()`.
- **Pure first.** Put state machines, layouts and models in pure functions with a test in `tests/` (one file per
  module); let the draw code consume them. Tests run in plain node: no DOM, no WebGL.
- **Do not invent server fields.** The API contract is `docs/CITY-API.md` in the backend repo. Treat every payload as
  untrusted: normalise, clamp, drop what you do not know.
- **Nothing of value in the client.** No wallet addresses in the world, no prices in postcards, no secrets, no keys,
  no `.env` files (they are git-ignored on purpose). Guests stay local.
- **Assets** must be CC0 or come with a licence we can ship: add the licence text to `licenses/`, the provenance to
  `ASSETS.md` and a line to `CREDITS.md`. Regenerate models with `tools/build-assets.mjs`, never by hand.
- **Dependencies**: `three` and `vite`, pinned. Adding one is a discussion, not a commit.
- **Claims stay true.** The README and the UI describe what exists; a feature that is planned is described as planned.

## Workflow

Branch from `feature/live-city` (the branch that is deployed), keep commits focused with a one-line subject that
says what changed for the user, and open a pull request. Do not change the repo's visibility or merge into `main`
without the owner.
