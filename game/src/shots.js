// Neon Harbor — deterministic staged scenes for screenshots.
// ?shot=cover|onfoot|driving|mission&seed=N skips the title screen and sets
// up one exact scene (fixed positions, fixed wanted level, fixed mission)
// so a headless render shows the same frame every time. These scenes only
// rearrange the same systems the player uses — nothing is faked.
//
// Top-10 iteration: every scene is shot in golden-hour light (18:32, low
// warm sun, orange sky — the neon signs glow instead of washing out), the
// streets by the camera are packed with staged traffic and pedestrians,
// the help cheat-sheet is hidden, and the cameras sit a touch lower and
// wider so the building faces and their signs read in frame.
export function applyShot(game, name) {
  const g = game;
  g.startGame({ shot: true });
  g.setGoldenHour();
  g.setClock(18 * 60 + 32); // golden hour, matching the warm light

  if (name === 'cover') {
    // Police chase: Jax in a red car, three stars, three Harbor PD units
    // closing in, the harbour-heist escape objective live on the HUD.
    g.enterCarAt(0xff2e4d, -40, -31, Math.PI / 2, 'sedan');
    g.setCash(2450);
    g.setWanted(3);
    g.spawnPoliceAt([
      { x: -72, z: -27 }, { x: -78, z: -36 }, { x: -64, z: -24 },
    ]);
    g.setMissionActive(3, 2);
    // Pack the street behind and beside the chase: traffic on the same
    // road and the cross street, pedestrians on both sidewalks.
    g.traffic.spawnNear(-40, -31, 7, { x: -40, z: -31 });
    g.peds.spawnNear(-40, -31, 9, { x: -40, z: -31 });
    // Front three-quarter framing: the red car facing camera, three Harbor
    // PD units closing in behind it down the street. Lower, wider than
    // before so the towers and their neon signs read above the chase —
    // but not so low the car itself is cut off at the frame's edge.
    g.setCameraPreset('orbit', { yaw: -Math.PI / 2, pitch: 0.22, dist: 15 });
  } else if (name === 'onfoot') {
    // On foot downtown, looking across the plaza toward the towers.
    g.teleportPlayer(-12, 18, Math.PI * 0.9);
    g.setCash(350);
    g.setWanted(0);
    g.setMissionActive(0, 0);
    // The plaza used to read empty: stage a crowd on its sidewalks and
    // traffic on the two streets that frame it.
    g.peds.spawnNear(-12, 18, 12, { x: -12, z: 18 });
    g.traffic.spawnNear(-12, 18, 5, { x: -12, z: 18 });
    g.setCameraPreset('orbit', { yaw: Math.PI * 0.9, pitch: 0.14, dist: 11 });
  } else if (name === 'driving') {
    // Cruising Sunset Strip in a yellow cab-style sedan, traffic ahead.
    g.enterCarAt(0xffc300, -124, 93, Math.PI / 2, 'sedan');
    g.setCash(1200);
    g.cruise = true; // roll gently down the strip so the speedo reads live
    g.setWanted(0);
    g.setMissionActive(1, 1);
    // The strip used to read empty: pack the road ahead of the cab and
    // the sidewalks beside it, so the drive has something to drive through.
    g.traffic.spawnNear(-100, 93, 8, { x: -124, z: 93 });
    g.peds.spawnNear(-100, 93, 8, { x: -124, z: 93 });
    g.setCameraPreset('chase');
  } else if (name === 'mission') {
    // On the pier at the vault, beacon up, one star, cops inbound.
    g.teleportPlayer(238, 56, -Math.PI / 2);
    g.setCash(800);
    g.setWanted(1);
    g.spawnPoliceAt([{ x: 200, z: 62 }]);
    g.setMissionActive(2, 1);
    // The pier used to read deserted: a crowd at the pier mouth and
    // traffic on the harbour-side street behind it.
    g.peds.spawnNear(232, 56, 10, { x: 238, z: 56 });
    g.traffic.spawnNear(217, 56, 5, { x: 238, z: 56 });
    // Look west along the pier toward the city: the deck leads the eye to
    // the player, the beacon and the cops beyond. The old north-east angle
    // filled the foreground with empty beach sand instead.
    g.setCameraPreset('orbit', { yaw: -Math.PI / 2, pitch: 0.2, dist: 14 });
  }
  // Signal headless screenshot tooling that the scene has settled.
  setTimeout(() => { window.__neonShotReady = name; }, 2200);
}
