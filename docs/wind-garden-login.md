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
