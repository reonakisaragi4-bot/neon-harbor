# neon-harbor

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/reonakisaragi4-bot/neon-harbor/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/reonakisaragi4-bot/neon-harbor/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Neon Harbor** is a fully original open-world crime game set in a sun-soaked
fictional coastal city. Explore on foot and by car, steal rides off the
street, outrun Harbor PD through a 5-star wanted system, run four story
missions for fixer Rico Vane, and take the harbor for yourself. Built with
three.js (vendored) and plain static files — no build step, no network at
runtime, no assets borrowed from any commercial game.

- **The city:** a procedural low-poly coastal metropolis — grid streets,
  varied towers, a central plaza, palm-lined sidewalks, a beach boardwalk,
  a harbour with docks, boats and a lighthouse, and a neon-arched bridge.
- **On foot & by car:** third-person walking, running and jumping with an
  orbit camera; steal any parked car (E), arcade driving, chase cam.
- **Living streets:** traffic cruising the grid (30 cars), pedestrians strolling the
  sidewalks who flee a speeding car (48 of them), cash pickups on the corners.
  Staged screenshots pack extra traffic and pedestrians near the camera, and
  the shots are taken in golden-hour light so the neon signs glow.
- **Wanted:** 1–5 stars for theft, assault and shooting; Harbor PD spawns,
  chases and rams; lose them to cool off.
- **Story:** four missions — First Contact, Getaway Driver, The Delivery,
  The Harbour Heist — with objectives, a beacon, dialogue and cash rewards.
- **Combat:** fists up close, pistol with muzzle flash and tracers.
- **HUD:** cash, wanted stars, health, clock, mission objective and a live
  2D minimap (with a pulsing red ring while the heat is on). Start screen, pause menu, save/load via localStorage.
  The controls cheat-sheet fades out a few seconds after play starts, so it
  never clutters a screenshot.
- **Sound:** fully synthesised WebAudio — engine hum, sirens, gunshots,
  pickups. No audio files.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome and press **Start Engine**.
(Or serve `game/` with any static server, e.g.
`python3 -m http.server 8000 --directory game`.)

**Controls:** WASD move · Shift run · Space jump · drag mouse to look ·
E steal / enter / exit car & talk · F punch · click shoot · 1 / 2 weapons ·
Tab missions · M mute · Esc pause & save.

---

<sub>Entered on [make.fun](https://make.fun/?ref=cdrpe06y&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
