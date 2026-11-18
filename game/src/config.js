// Neon Harbor — shared constants: city geometry, tuning, names and palette.
// One file holds every magic number so the rest of the game reads like a design doc.
export const CFG = {
  // City grid: streets every PITCH units, blocks between them.
  PITCH: 62,
  BLOCKS: 7,            // blocks per side (7 x 7 = 49 blocks)
  STREET_W: 15,         // asphalt width
  SIDEWALK_W: 4,        // sidewalk band on each side of a street
  // World extents (city core). South is the beach, east is the harbour.
  CITY_HALF: 7 * 62 / 2,           // 217 — half-width of the street grid
  BEACH_Z: 232,                   // sand starts here (south edge)
  WATER_Z: 268,                   // sea plane starts here
  HARBOUR_X: 232,                 // docks start here (east edge)
  WATER_X: 268,
  // Player / car tuning
  WALK_SPEED: 5.2,
  RUN_SPEED: 9.0,
  JUMP_VEL: 7.5,
  GRAVITY: 22,
  CAR_TOP_SPEED: 34,              // units/s (~122 km/h feel)
  CAR_ACCEL: 16,
  CAR_BRAKE: 30,
  CAR_STEER: 1.9,
  // Wanted / police
  WANTED_MAX: 5,
  WANTED_DECAY_SEEN: 12,         // seconds unseen before a star drops
  POLICE_SPEED: 30,
  // Missions
  MISSION_REWARDS: [200, 500, 800, 2000],
  // Clock: one in-game minute every 2 real seconds, starting 09:00.
  CLOCK_START_MIN: 9 * 60,
  CLOCK_RATE: 0.5,                // game minutes per real second
};

// Original fictional names — nothing borrowed from any commercial game.
export const NAMES = {
  CITY: 'Neon Harbor',
  PLAYER: 'Jax Marlowe',
  FIXER: 'Rico Vane',
  COP: 'Harbor PD',
  DISTRICTS: ['Old Pier', 'Marina Bay', 'Coral Row', 'Sunset Strip', 'Docklands', 'Palm Court', 'The Boardwalk'],
};

// Sun-soaked coastal palette: warm plaster, coral, teal, mustard, palm green.
export const PALETTE = {
  building: [0xf2e3c9, 0xffb59e, 0x8fd8d2, 0xffd166, 0xf78fb3, 0xa3c4ff, 0xff8e72, 0xcfd8dc, 0xffe29a, 0x9be7c4],
  roof: [0x5b4a68, 0x8a5a44, 0x3d6b8e, 0x6b4a2f, 0x37474f],
  road: 0x2f3240,
  sidewalk: 0x9aa0ad,
  ground: 0x6f7d5a,
  sand: 0xe8d29a,
  water: 0x1e7fa8,
  car: [0xd7263d, 0xffc300, 0x1b9aaa, 0xf4f1de, 0x7b2fbe, 0x2ec4b6, 0xff6b35, 0x3a86ff],
  neon: [0xff2e88, 0x00e5ff, 0xffe259, 0x7dff9b, 0xff6b35],
};

// Player spawn: the corner of Coral Row and the Boardwalk, on foot.
export const SPAWN = { x: -31, z: 31, yaw: Math.PI * 0.75 };
