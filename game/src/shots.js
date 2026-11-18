// Neon Harbor — deterministic staged scenes for screenshots.
// ?shot=cover|onfoot|driving|mission&seed=N skips the title screen and sets
// up one exact scene (fixed positions, fixed wanted level, fixed mission)
// so a headless render shows the same frame every time. These scenes only
// rearrange the same systems the player uses — nothing is faked.
export function applyShot(game, name) {
  const g = game;
  g.startGame({ shot: true });
  g.setClock(10 * 60 + 24); // late morning, hard sun

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
    // Front three-quarter framing: the red car facing camera, three Harbor
    // PD units closing in behind it down the street.
    g.setCameraPreset('orbit', { yaw: -Math.PI / 2, pitch: 0.3, dist: 13 });
  } else if (name === 'onfoot') {
    // On foot downtown, looking across the plaza toward the towers.
    g.teleportPlayer(-12, 18, Math.PI * 0.9);
    g.setCash(350);
    g.setWanted(0);
    g.setMissionActive(0, 0);
    g.setCameraPreset('orbit', { yaw: Math.PI * 0.9, pitch: 0.3, dist: 9 });
  } else if (name === 'driving') {
    // Cruising Sunset Strip in a yellow cab-style sedan, traffic ahead.
    g.enterCarAt(0xffc300, -124, 93, Math.PI / 2, 'sedan');
    g.setCash(1200);
    g.cruise = true; // roll gently down the strip so the speedo reads live
    g.setWanted(0);
    g.setMissionActive(1, 1);
    g.setCameraPreset('chase');
  } else if (name === 'mission') {
    // On the pier at the vault, beacon up, one star, cops inbound.
    g.teleportPlayer(238, 56, -Math.PI / 2);
    g.setCash(800);
    g.setWanted(1);
    g.spawnPoliceAt([{ x: 200, z: 62 }]);
    g.setMissionActive(2, 1);
    // Camera a touch north-east so the pier, the beacon and the city all read.
    g.setCameraPreset('orbit', { yaw: -Math.PI / 2 + 0.7, pitch: 0.42, dist: 12 });
  }
  // Signal headless screenshot tooling that the scene has settled.
  setTimeout(() => { window.__neonShotReady = name; }, 2200);
}
