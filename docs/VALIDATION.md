# Prototype validation — 2026-10-09

- Six Node state tests pass: draft validation/limits, malformed storage, draft recovery, safe residential profile validation and axis-aligned demo route.
- Production build succeeds. Vite reports the expected bundle-size warning for the Three.js renderer (about 622 kB uncompressed / 161 kB gzip JavaScript).
- Chrome desktop: loaded furnished home and project buildings, opened project/apartment dialogs, saved a resident profile, reloaded and verified persistence, saved and recovered a demo project brief.
- Demo routine: entered the walk, progressed through the Workshop stops and returned to the final home status; tour button became available again.
- Chrome viewport override 390 x 844: responsive toolbar and project strip are present. Resident dialog measured 350 x 527 px inside the viewport, with name/ticker/color and submit control accessible. This is viewport testing, not an actual iPhone/Safari GPU benchmark.
- Bundled asset files: 37 files, 1,821,491 bytes total; approximately 487,963 bytes if individually gzipped. This includes selected unused kit pieces and is not a measured HTTP transfer or GPU memory allocation.
- No live brain, wallet, token creation, exclusive apartment ownership or fee routing is implemented. Local test data uses a demo neighbor and demo brief; it is not included in repository source.
