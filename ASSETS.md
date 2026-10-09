# Asset provenance

## Quaternius — Ultimate Modular Men

- Creator: Quaternius.
- Source: https://quaternius.com/packs/ultimatemodularcharacters.html
- Public download folder linked by creator: https://drive.google.com/drive/folders/1USAAquX2JJWuA2m6zol0KUkFe3UkZ8zX
- Selected model: `Individual Characters/glTF/Casual_Hoodie.gltf`.
- License: CC0 1.0; creator's license text preserved in `licenses/Quaternius.txt`.
- Derived model: `hoodie.glb` and `anims.glb` (see below). The former `public/assets/characters/Casual_Hoodie.glb` (embedded buffers, six animations, unpruned) was removed from `public/`; it is still in git history at commit `01054cc`. Runtime materials recolor hair and clothing.

## KayKit — City Builder Bits 1.0

- Creator: Kay Lousberg.
- Source: https://kaylousberg.itch.io/city-builder-bits
- Official repository: https://github.com/KayKit-Game-Assets/KayKit-City-Builder-Bits-1.0
- Selected files: three building variants without bases, street props, a car, shrubs, and road models.
- License: CC0 1.0; preserved in `licenses/KayKit-city.txt`.

## KayKit — Furniture Bits 1.0

- Creator: Kay Lousberg.
- Source: https://kaylousberg.itch.io/furniture-bits
- Official repository: https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0
- Selected files: bed, chair, table, couch, shelf, lamp, cactus, rug.
- License: CC0 1.0; preserved in `licenses/KayKit-furniture.txt`.

## Original scene elements

The cutaway shell, street surface, trees, signs, inexpensive desk monitor, UI and layout were created for this prototype. The scene is inspired by isometric life simulators; it contains no extracted EA/The Sims assets or branding.

## Dependencies

Three.js is MIT-licensed. Its notices are included under `licenses/Three.js-MIT.txt`. Versions are pinned and reproducible through `package-lock.json`.

## Tokyo street-life pass

Articulated background pedestrians, vehicles, lanterns, blossom trees and petals are original procedural geometry; no new third-party models were downloaded. The existing Quaternius character remains the detailed central avatar. Research references: GO TOKYO Shibuya, Shinjuku and Meguro River guides; their photos are not bundled.

## Asset pipeline

`tools/build-assets.mjs` regenerates `public/assets/characters/` (`hoodie`, `jacket`, `suit`, `tee`, `worker`, `anims`), `public/assets/room/`, and `licenses/Kenney.txt`:

```
npm install --prefix tools
node tools/build-assets.mjs <quaternius-dir> <kenney-kit-dir> <Casual_Hoodie.glb>
node --test tests/*.test.js
```

- `<quaternius-dir>` holds `Casual_2.gltf`, `Suit.gltf`, `Beach.gltf` and `Worker.gltf` from the Ultimate Modular Men download. `Punk.gltf` is not used.
- `<kenney-kit-dir>` is the Furniture Kit 2.0 root, containing `Models/GLTF format/` and `License.txt`.
- `<Casual_Hoodie.glb>` is the original pack export, which supplies the hoodie mesh and the six clips. It is no longer in the tree. Restore it with `git show 01054cc:public/assets/characters/Casual_Hoodie.glb > <path>` and pass that path. The build reads it and never writes to it.
- All three inputs are read only. Their contents are parsed, never executed.
- Tooling is `@gltf-transform/core`, `functions` and `extensions` at exact version 4.5.1 in `tools/package.json`. No lockfile is committed, so only those three direct packages are pinned. Two consecutive builds produced identical bytes.
- Constraints: no textures (flat material colours), no Draco or Meshopt (the app CSP forbids WebAssembly), and `KHR_mesh_quantization` only, which three.js `GLTFLoader` reads natively.

## Kenney — Furniture Kit 2.0 (room models)

- Source: https://kenney.nl/assets/furniture-kit. CC0 1.0; text preserved in `licenses/Kenney.txt`.
- Files: 57 models in `public/assets/room/`, one per name in `manifest.json`. The manifest gives each model's world-space `size`, `min` and `bytes`, so placement can use them directly. Most origins sit on the floor (`min.y = 0` for 56 of 57; the ceiling fan hangs below its origin). X and Z placement varies by model, so do not assume centring; only six are centred in X and Z.
- Processing: pruned, deduplicated (names kept), welded, and quantised with positions as normalised Int16 and normals as normalised Int8. The processed bounds match three.js `Box3` to within 0.05 mm.

## Quaternius — Ultimate Modular Men (characters and clips)

- Source: https://quaternius.com/packs/ultimatemodularcharacters.html. CC0 1.0; text preserved in `licenses/Quaternius.txt`.
- Outputs: `hoodie.glb` (from the hoodie export), `jacket.glb` (`Casual_2.gltf`), `suit.glb` (`Suit.gltf`), `tee.glb` (`Beach.gltf`), `worker.glb` (`Worker.gltf`), `anims.glb` (six clips from the hoodie export).
- `tee.glb` uses Beach. Its upper body is one fitted torso layer (LightBrown, hips to neckline) over shorts. Punk layers a white top under a black collared top, which reads as layered punk styling. No pack model has sleeve meshes: arms are part of the skin, so the tee is sleeveless in the rig.
- Props: `suit.glb` drops the `Pistol` node (three primitives, materials DarkBrown, Grey and Black). The dominant bone of every vertex is a right-hand bone, and the build fails otherwise, so no body part can go by mistake. Nothing else is a prop. Worker's yellow piece is a hard hat, and its grey and black pieces are boots; both stay as clothing. Hoodie, jacket and tee have no props; tee keeps its earrings.
- Character processing: animations removed; texture coordinates removed (no textures); jacket and suit's all-white vertex colour set removed (values 1.0, so the look is unchanged); welded; quantised with one scene-wide volume, positions as Int16, normals as Int8 and weights as Uint8. Each vertex's weights are forced to sum to exactly 255, the per-outfit skin copies are merged into one, and the rig keeps the same 62 bone names in the same order. Material names are unchanged. Node transforms are rounded to 1e-7 (about float32 precision), which saves about 5 KB per file of JSON noise.
- `anims.glb`: only Idle, Idle_Neutral, Walk, Run, Wave and Interact, targeting the 52 bones they use, with no meshes or skins. Channels that stay constant at the rest pose on every outfit (322 of them) are dropped, so a crossfade cannot leave a bone mid-pose. Rotation keys are normalised Int16, which three.js denormalises on load; translation keys stay Float32. Keys stay at the source 30 fps: resampling to 15 fps was measured and rejected, because linear keys at 15 fps miss the Run leg rotations by up to 10.8 degrees and some translation by up to 40 mm.
- Quantisation: 16-bit positions are kept. Bit depths of 12 to 14 would still store Int16 and save no bytes; only 8-bit storage saves bytes (see the budget note).

## Sizes (bytes, current build)

| File | Bytes |
| --- | ---: |
| `characters/hoodie.glb` | 306,720 |
| `characters/jacket.glb` | 288,188 |
| `characters/suit.glb` | 326,624 |
| `characters/tee.glb` | 326,920 |
| `characters/worker.glb` | 265,720 |
| `characters/anims.glb` | 120,772 |
| Characters and anims combined | 1,634,944 (budget 1,640,000) |
| One outfit plus anims | 386,492 to 447,692 (budget 1,200,000: met) |
| `room/` folder, all 58 files | 348,497 (budget 1,000,000: met) |

The combined budget was relaxed to 1,640,000 bytes: the measured total rounded up to the next 10 KB. The original 1.2 MB target cannot be reached without visible loss. Each outfit has 10,534 to 13,335 vertices. The pack is flat-shaded cubes with a per-face normal, so there are about two vertices per triangle (a closed smooth mesh has about one-half). After quantisation that is about 20 bytes per vertex: positions 8, normals 4, joints 4, weights 4. Two options would cut bytes further, and neither is applied. 8-bit positions save about 254 KB; the set would then be about 1.38 MB, still over 1.2 MB, and they add up to 3.7 mm of error on the 1.9 m avatar. Smooth normals would reduce the vertex count but change the look; this has not been measured. The app loads one outfit at a time, so the per-outfit figure is the one that reaches a phone.
