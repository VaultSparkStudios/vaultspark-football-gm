# Franchise Architect Packages

Shared packages for the broader sports simulation universe. These are boundaries first; code should move here only when a second sport or repeated football subsystem proves the abstraction.

- `sim-core` - deterministic season/game simulation primitives that can generalize across sports.
- `contracts-core` - cap, salary, guarantees, dead money, and negotiation concepts.
- `draft-core` - scouting, prospect boards, pick values, draft clocks, and CPU drafting.
- `league-history` - records, awards, career timelines, Hall of Fame, dynasty lore, and archive exports.
- `ui-kit` - reusable interface primitives for Franchise Architect sports games.
- `save-format` - browser save schema, migration, integrity stamps, challenge/share codes.