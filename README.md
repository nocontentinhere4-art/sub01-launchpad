# SUB-01 · The neighborhood

A lightweight isometric prototype for SUB-01’s Tokyo launchpad: a home/workspace, three project buildings, a residential block, an animated developer, and an expanded city you can explore. Eight surrounding districts add 48 addresses and an original Tokyo Tower landmark. The current block is fictional and Tokyo-inspired; it is not a geographically accurate reconstruction.

## Run

Requires Node.js 20.19 or newer.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:8791. For production, run `npm run build` and serve `dist/` as a static site. `npm run preview` serves the built version locally.

## What works now

- A real Three.js scene with downloaded CC0 models from KayKit and Quaternius.
- A cutaway furnished home, three selectable project buildings, a street, and an original residential block.
- A customized hoodie character with imported idle, walk and wave animations.
- A local resident profile with name, avatar color and concept ticker. A second character appears outside Orange Apartments; the example apartment is not exclusive or owned.
- A fixed demo walk from home to the Workshop and back.
- Project inspection, camera orbit/pan/zoom, follow mode and day/night lighting.
- Choose one of 48 addresses, take an existing building or an empty lot, and create an apartment block, studio or project HQ with a name, description, concept ticker and facade color.
- Created buildings appear in the city and recover from local storage after reload; duplicate claims are prevented in the current browser.
- District navigation, home/Tokyo Tower shortcuts and safe text rendering. Legacy idea briefs remain readable.
- Original Fuji silhouette with a jagged snow cap, a taller skyline, Shibuya crossing, shop canopies, small cars, vending machines and vertical Japanese/English signs inspired by the supplied references.
- Day/night presentation with lit windows and a dark interface; a single generated 1024 × 1024 atlas serves the storefront signs.
- Shared instanced geometry batches the surrounding city, windows, roofs and tower lattice without new downloaded assets.
- Responsive desktop/mobile interface, capped pixel ratio, 30 FPS target on mobile and reduced shadow resolution.
- A private GitHub repository. No credentials, private keys or authenticated browser state are part of this project.

## What this preview does not do

The demo routine is scripted and does not connect to SUB-01's brain. The example projects have no deployed tokens, functional games or music products. Drafts and building assignments stay on the current device. Addresses are not exclusive across users. All 48 lightweight addresses load together; geographic streaming and shared ownership remain future work. There are no purchases, real fee payments, X account connections or real token launches. The UI labels this as a concept preview.

## Next integration

See `docs/TOKYO-CITY.md` for the scalable city and resident ownership proposal, and `docs/ARCHITECTURE.md` for the server-authoritative event model, project isolation, publishing, wallet signing, fee configuration, and community management plan. These are proposed integration points, not completed services.

## Validation

```sh
npm test
npm run build
```

The state tests cover brief validation, queue limits, corrupt storage recovery and continuity of the demo route. Browser checks should cover project dialogs, focus handling, draft creation/recovery, camera controls and mobile layout. Actual iPhone GPU and Safari performance must be measured on a device before a public rollout.

## Assets

Only the selected runtime assets are bundled; source collections stay outside this repo. Attribution, origins, licenses and derived-file notes are in `ASSETS.md` and `licenses/`. Original animation names are preserved. Quaternius's embedded glTF was converted to GLB; unused animation definitions were omitted, while its binary animation buffer is retained. No Sims/EA assets are included.
