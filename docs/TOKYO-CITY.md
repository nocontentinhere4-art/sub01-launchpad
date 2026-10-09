# SUB-01 Tokyo: a city that is the launchpad

## Product model

- A resident has a character and an apartment: identity, personal room, favorites and invitations.
- A project has a building: its site, verified coin, development progress and community live behind the door.
- A team can occupy several floors. A residential apartment does not automatically mint a token.
- SUB-01 has a home and a workshop. Real brain decisions will arrive through the bounded server adapter, rather than a browser running a brain for every viewer.
- A city block contains homes and projects. Extend the city one block at a time, with a recognizable stylized Tokyo street vocabulary: narrow storefronts, vending machines, rail stations, neon signs and rooftop equipment.

Do not couple skyline height, avatar status or access to token price. Show verifiable milestones such as site published, coin minted and project maintained. Buildings can be interesting even without launching a coin.

## Rendering architecture — next implementation

City map → one active block → one interior. These are different detail levels. The overview should use a 2D map or instanced untextured building masses, not thousands of detailed interiors. Loading an interior unloads or pauses the block detail. Each district has an immutable asset manifest and versioned snapshot.

Proposed limits, to be profiled on real phones: 24–40 simple buildings in the active block, at most 12 visible animated residents, shared atlas textures, capped resolution, 30 FPS mobile target, no screen-space reflections or volumetric effects. The prototype now loads the original furnished center and eight lightweight surrounding districts (48 addresses), all models and two characters; streaming/LOD is not yet implemented. The surrounding buildings, windows and tower lattice use instanced geometry.

Distance reduces avatars to icons. Distant animation pauses. Nearby residents use shared character meshes and a small animation library. Avoid a unique high-resolution texture per user and avoid rendering third-party websites into every window. Open project sites as normal web views.

When WebGL is unavailable or performance is poor, the production client should offer a usable 2D map and project directory. Capped frame rate alone does not establish device compatibility.

## Real apartments / property — proposed backend

Use a server-side unit registry first, not an NFT requirement. Tables: residents, buildings, units, memberships, projects, token_links and event_log. Each unit has a stable ID, building ID, owner resident ID (nullable), availability, revision and explicit permission policy.

Sign in with a fresh wallet challenge tied to origin, nonce and expiry; verify on the server. A reservation must atomically change a vacant unit to assigned under a unique constraint. Browser local storage never determines ownership. An apartment is an application access right, not a claim to real Tokyo property.

Define free/paid entitlement and retention before sales. Transfers need authorization from the current owner, recipient acceptance, revocation of old access and an audit event. Building management permissions and fee recipients are separate records. CTO must not implicitly transfer apartment rights, X credentials or immutable token fee allocations.

## Coin connection

Residents can draft a ticker before launching. A ticker does not establish token identity: chain + mint address does. Only mark a coin linked after verifying the launch transaction and project authorization. An existing token requires proof of the relevant authority and clear distinction between an official project and a community page. Do not treat owning a few tokens as proof of creator control.

Fee configuration belongs to the verified launch flow. Apartment possession alone confers no fee entitlement. Present the exact beneficiary wallets and enforceable split before signing; updates depend on the launch platform’s actual rules. The earlier 80/20 discussion is still a proposal.

## Reference reviewed

https://github.com/jeantimex/tokyo (reviewed 2026-10-09) reconstructs real Tokyo areas from PLATEAU, OpenStreetMap and elevation data and warns that its live demo is not recommended for mobile browsers. Its binary tile pipeline is useful architectural inspiration. This prototype does not bundle that repository’s code, geographic data or assets. Any later geographic import needs separate data-source and attribution review.

## What can be tried today

Explore district → choose a building/lot → Take this address → fill name, idea, concept ticker, style and color → Create this place. The geometry changes immediately, the address becomes assigned in this browser and recovers after reload. The city is a stylized grid using Tokyo district names, not geographic data.


Orange Apartments → Try your own apartment → name, color and concept ticker. A local profile and avatar survive reload on the same browser. Every viewer has the same demo unit; there is no global reservation, minted coin or wallet identity yet.

## Next concrete milestone

Two real users log in, obtain different server-assigned apartments, see each other’s bounded movement, and open one project building with its working site. Connect the brain to visible world events. Add token creation only after identity, authorization and deployment recovery are verified.
