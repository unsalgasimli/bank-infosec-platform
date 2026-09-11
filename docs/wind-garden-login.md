# The Wind Garden

## Repository findings and boundaries

React 19, Vite 6, TypeScript, Lucide, global CSS with Tailwind utilities, custom URL routing and AZ/EN context. No existing 3D renderer or reusable environment assets. The scene is procedural and locally bundled; it needs no models, image downloads, remote scripts, audio, or CSP changes.

Keep AuthContext, the LDAP endpoint, server session cookies, same-origin middleware, authorization, rate limits and credential payload semantics unchanged. Only the form owns credentials. World inputs are public presentation state, instrument positions and interaction events. App retains the login presentation briefly after a successful server identity update; this does not delay session creation or authorize anyone.

## Concepts considered before implementation

1. **Tidal paper atlas:** folded islands reveal passages as water rises. Strong unusual silhouette and exploration, but convincing shore interactions need more geometry and input complexity; mobile loses much of the experience.
2. **The Wind Garden:** a ceramic architectural miniature with three ivory wind instruments. Light, water, paper and clay share a coherent material language. Clicking and orbiting have immediate physical meaning. The optional tuning puzzle can also be represented with ordinary accessible buttons. Excellent procedural feasibility and a strong still image even without motion.
3. **Suspended mechanical theatre:** counterweights, curtains and tiny moving stages. Rich discoveries, but the dense mechanisms compete with credential entry and require many moving parts to become legible.

Selected: **The Wind Garden**. It has the best combination of originality, meaningful interaction, approachable controls, quiet return visits and graceful static/mobile presentation. This is a place to pause before work, not a diagram of enterprise security.

## Art and interaction direction

Warm chalk background, patinated terracotta architecture, ivory folded sails, oxidized teal water, brass details. A large arch anchors the composition; smaller kinetic instruments give it scale. Editorial serif typography belongs to a small gallery catalogue. Authentication is a clearly identified utility surface with native labels and familiar controls.

The world idles with gentle sail motion and water highlights. Dragging orbits within narrow bounds; clicking instruments turns them. The first three-dial puzzle opens the flowers and automatically reveals a second, coupled puzzle: each dial also turns its neighbor. Its targets are generated from reachable moves. Completing it unfurls a large moonflower, releases paper butterflies and sends the camera-facing bird on a short flight. Paused and reduced-motion modes show the completed garden without flight. A bird, hanging bell and occasional paper glider provide discoveries. Broad foliage and floating lily leaves replace the original stair detail. No global keyboard listener, pointer lock, autoplay sound or remote API.

Mobile gets a compact fixed-camera exhibit after the form. Reduced motion and pause use event-driven still rendering. A local SVG illustration remains behind the lazily initialized WebGL scene and serves as the failure fallback. Hidden pages stop rendering; geometry, materials, listeners, observers and renderer are disposed on teardown. DPR is capped and can step down under sustained slow frames.

The success transition passes through the garden arch in about 800 ms. Reduced motion skips it. Errors remain explicit inline messages and a quiet instrument-color change. No game or scene initialization can gate authentication.

## Replayable easter eggs

The original two-stage sail-tuning puzzle remains the garden's visual progression. The optional game drawer also contains two compact replay loops that can be played independently and repeatedly during a signed-out session:

- **Wind Echo** presents a growing sequence of bell, bird and wind signs. Study it, then reproduce it from memory.
- **Lily Trail** applies the same escalating-memory mechanic to a changing three-by-three path of lily leaves.
- Clicking the porcelain bird three times in quick succession opens **Garden Flight** as a centred 3D overlay. The player mark is the bank's golden spiral-e emblem (traced tangentially in code and extruded with a soft bevel — no external asset). Click/tap or use Space to flap through the wisteria-draped garden arches; every obstacle closes in from both above and below.

Each new round derives a fresh deterministic pattern locally. The memory games keep their scores in component state only. Garden Flight persists a single number — the visitor's best score — under the local `garden-flight.best` key so the record survives a reload; nothing is sent to the server and no visitor interaction can affect sign-in.

## Garden Flight arcade and leaderboard

The sign-in page never learns who is visiting, so the leaderboard lives on the authenticated side of the platform:

- **After sign-in**, a small golden-emblem chip drifts near the bottom-right corner of the main screen (both the alive and classic shells). Hovering reveals what it guards; clicking opens the **Garden Flight arcade**, a modal with the same golden Expressbank emblem, physics and controls, plus a live leaderboard panel. The trigger, its modal and the 3D scene are lazy-loaded chunks, so `three` stays out of the initial bundle.
- Every finished run is recorded server-side under the **session identity** (`req.user`, never a client-supplied name) via `POST /api/game/flight/score`; `GET /api/game/flight/leaderboard` returns the top ten best flights plus the signed-in player's rank, best and run count. Both routes sit behind `requireAuthentication`.
- Scores live in the `game_flight_scores` table (migration `069`), one row per run, with display-name snapshots; the leaderboard aggregates each player's best. A new personal best is flagged on the landing card, and the local `garden-flight.best` record from the sign-in page seeds the in-app personal best.
- The arcade degrades gracefully: if the score cannot be recorded, the run still counts locally and the panel says so. The login-page miniature never calls these endpoints.

## Seasonal day cycle

Live mode follows the current date at the garden's fixed Baku coordinates, using [NOAA's approximate solar equations](https://www.gml.noaa.gov/grad/solcalc/solareqns.PDF). Latitude, longitude, declination and equation of time determine elevation, azimuth, sunrise and sunset. This is a clear-sky artistic simulation, not a weather forecast or precision astronomical instrument; the moon and stars are illustrative scenery. There is no geolocation request or network dependency.

Sun direction and atmospheric color drive the real scene lighting, shadow direction, water response and page palette. Lanterns fade on around sunset; diffuse blue moonlight and a small instanced firefly population appear after dark. The bird settles. A clock opens an accessible range control, dawn/noon/sunset/night presets, a two-minute day preview, pause and return to live. The preview pauses its progression in hidden tabs and is disabled for reduced motion. Manual time changes and a static night fallback remain available. Changes to time never alter game progress or authentication values.

Palette foregrounds are chosen to retain at least 4.5:1 contrast against the page surface throughout the cycle. Scene resources still share the login teardown lifecycle; shadow refreshes are bounded, and the existing low-performance still mode remains available.

## Model refinement

The ceramic arch has bevelled edges, inset contours, radial joints and footings. The island has turned lips, a recessed band and radial paving joints. Sail instruments include raised hems, a centre seam, mounting bolts, axle collars and graduated brass rims. The bell has a hollow turned profile and a separate clapper. A glazed porcelain bird replaces the primitive folded body; overlapping feathers, a swept tail, eyes and articulated feet retain the existing flight and discovery interactions.

Botanicals use curved, veined surfaces, stems, planted pockets and river stones. Cupped lily leaves have radial veins; the final flower has a detailed pollen centre, and butterflies have curved wings and bodies. Local deterministic clay and linen bump maps share two small textures. A generated studio environment supplies material reflections while solar lighting controls direct illumination. Static fittings are merged by material, foliage remains instanced, and environment targets and textures are disposed with the scene. The model geometry is approximately 134k triangles on desktop and 65k in compact mode; this is a geometry budget, not a claim of frame rate on user hardware.
