# Credits

Third-party work bundled in or loaded by this client, with its licence. `ASSETS.md` describes how the models were
processed; the licence texts are in `licenses/`.

## 3D models (all CC0 1.0, public domain dedication)

| Pack | Creator | Where in this repo | Licence text |
| --- | --- | --- | --- |
| Furniture Kit 2.0 | [Kenney](https://kenney.nl/assets/furniture-kit) | `public/assets/room/*.glb` (57 room pieces) | `licenses/Kenney.txt` |
| Ultimate Modular Men | [Quaternius](https://quaternius.com/packs/ultimatemodularcharacters.html) | `public/assets/characters/*.glb` (four outfits, worker, clips) | `licenses/Quaternius.txt` |
| City Builder Bits 1.0 | [Kay Lousberg](https://kaylousberg.itch.io/city-builder-bits) | `public/assets/city/` | `licenses/KayKit-city.txt` |
| Furniture Bits 1.0 | [Kay Lousberg](https://kaylousberg.itch.io/furniture-bits) | `public/assets/furniture/` | `licenses/KayKit-furniture.txt` |

CC0 asks for no attribution; the creators are credited here because they asked nicely. The KayKit files date from
the first prototype and are not referenced by the current source.

Everything else in the scene (the city, streets, landmarks, SUB-01's house, signs, the sign atlas, procedural
vehicles and crowd figures) is original procedural geometry made for this project.

## Fonts (SIL Open Font License 1.1)

Loaded at runtime from Google Fonts, not bundled:

- [Archivo](https://fonts.google.com/specimen/Archivo) by Omnibus-Type.
- [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) by JetBrains.

## Libraries

- [three.js](https://threejs.org/) r169, MIT (`licenses/Three.js-MIT.txt`), including the addons used
  (`GLTFLoader`, `OrbitControls`, `SkeletonUtils`, `BufferGeometryUtils`).
- [Vite](https://vite.dev/) 6, MIT (dev dependency).
- `@gltf-transform` 4.5.1, MIT (offline asset tooling in `tools/`, not shipped).

## Brand

The SUBZERONE marks, lockups and icons in `public/brand/` are original and belong to the owner; they are not covered
by any of the licences above.
