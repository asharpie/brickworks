// Seed the Turso database with a handful of demo creations.
// Run locally after configuring .env:
//
//   npm run seed
//
// Safe to re-run — it wipes any existing rows first and reinserts the demos.

try { require('dotenv').config(); } catch {}

const { q } = require('../lib/db');

// ---- Helper builders ----
// Every brick: { type, color, x, y, z, rot }
// Coords: x/z in studs, y in plates (brick = 3 plates), rot in 0..3.

// ---------- 1. Red Racecar ----------
function racecar() {
  const B = [];
  // Chassis
  B.push({ type: 'plate_2x4', color: 'black', x: -4, y: 0, z: -1, rot: 0 });
  B.push({ type: 'plate_2x4', color: 'black', x: 0,  y: 0, z: -1, rot: 0 });
  // Body
  B.push({ type: 'brick_2x4', color: 'red', x: -4, y: 1, z: -1, rot: 0 });
  B.push({ type: 'brick_2x4', color: 'red', x:  0, y: 1, z: -1, rot: 0 });
  B.push({ type: 'brick_2x2', color: 'red', x: -2, y: 4, z: -1, rot: 0 });
  B.push({ type: 'brick_2x2', color: 'azure', x: 0, y: 4, z: -1, rot: 0 });
  B.push({ type: 'slope_2x2', color: 'red', x:  2, y: 4, z: -1, rot: 2 });
  B.push({ type: 'slope_2x2', color: 'red', x: -4, y: 4, z: -1, rot: 0 });
  // Wheels
  B.push({ type: 'round_2x2', color: 'black', x: -3, y: 0, z: -2, rot: 0 });
  B.push({ type: 'round_2x2', color: 'black', x: -3, y: 0, z:  1, rot: 0 });
  B.push({ type: 'round_2x2', color: 'black', x:  1, y: 0, z: -2, rot: 0 });
  B.push({ type: 'round_2x2', color: 'black', x:  1, y: 0, z:  1, rot: 0 });
  // Spoiler
  B.push({ type: 'tile_1x2', color: 'black', x: 3, y: 7, z: -1, rot: 0 });
  B.push({ type: 'tile_1x2', color: 'black', x: 3, y: 7, z: 0,  rot: 0 });
  return B;
}

// ---------- 2. Little House ----------
function house() {
  const B = [];
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2; j++)
      B.push({ type: 'plate_4x4', color: 'tan', x: -4 + i*4, y: 0, z: -4 + j*4, rot: 0 });
  const y0 = 1;
  for (let r = 0; r < 3; r++) {
    const y = y0 + r * 3;
    B.push({ type: 'brick_2x4', color: 'white', x: -4, y, z: -4, rot: 0 });
    B.push({ type: 'brick_1x2', color: 'white', x:  0, y, z: -4, rot: 0 });
    if (r === 2) B.push({ type: 'brick_2x2', color: 'white', x: 2, y, z: -4, rot: 0 });
    B.push({ type: 'brick_2x4', color: 'white', x:  4, y, z: -4, rot: 2 });
    B.push({ type: 'brick_2x4', color: 'white', x: -4, y, z: 2, rot: 0 });
    B.push({ type: 'brick_2x4', color: 'white', x:  0, y, z: 2, rot: 0 });
    B.push({ type: 'brick_1x4', color: 'white', x: -4, y, z: -2, rot: 1 });
    B.push({ type: 'brick_1x4', color: 'white', x:  7, y, z: -2, rot: 1 });
  }
  B.push({ type: 'brick_2x2', color: 'azure', x: -2, y: 4, z: -4, rot: 0 });
  const roofY = y0 + 3 * 3;
  for (let i = 0; i < 4; i++) {
    B.push({ type: 'slope_2x2', color: 'brown', x: -4 + i * 2, y: roofY, z: -4, rot: 2 });
    B.push({ type: 'slope_2x2', color: 'brown', x: -4 + i * 2, y: roofY, z:  2, rot: 0 });
  }
  B.push({ type: 'brick_2x2', color: 'brown', x: -2, y: 1, z: -4, rot: 0 });
  B.push({ type: 'brick_2x2', color: 'brown', x: -2, y: 4, z: -4, rot: 0 });
  return B;
}

// ---------- 3. Pixel Heart ----------
function heart() {
  const B = [];
  const shape = [
    "  ##  ##  ",
    " ######## ",
    " ######## ",
    "##########",
    "##########",
    " ######## ",
    "  ######  ",
    "   ####   ",
    "    ##    ",
  ];
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (shape[r][c] === '#') {
        B.push({ type: 'brick_1x1', color: 'red', x: c - 5, y: 0, z: r - 4, rot: 0 });
      }
    }
  }
  return B;
}

// ---------- 4. Micro Castle ----------
function castle() {
  const B = [];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      B.push({ type: 'plate_2x2', color: 'lgray', x: -3 + i*2, y: 0, z: -3 + j*2, rot: 0 });
    }
  }
  for (let r = 0; r < 4; r++) {
    const y = 1 + r * 3;
    B.push({ type: 'brick_2x2', color: 'lgray', x: -3, y, z: -3, rot: 0 });
    B.push({ type: 'brick_2x2', color: 'lgray', x:  1, y, z: -3, rot: 0 });
    B.push({ type: 'brick_2x2', color: 'lgray', x: -3, y, z:  1, rot: 0 });
    B.push({ type: 'brick_2x2', color: 'lgray', x:  1, y, z:  1, rot: 0 });
    B.push({ type: 'brick_1x2', color: 'lgray', x: -1, y, z: -3, rot: 0 });
    B.push({ type: 'brick_1x2', color: 'lgray', x: -1, y, z:  2, rot: 0 });
    B.push({ type: 'brick_1x2', color: 'lgray', x: -3, y, z: -1, rot: 1 });
    B.push({ type: 'brick_1x2', color: 'lgray', x:  2, y, z: -1, rot: 1 });
  }
  const top = 1 + 4 * 3;
  for (let i = -3; i < 3; i += 2) {
    B.push({ type: 'brick_1x1', color: 'lgray', x: i,  y: top, z: -3, rot: 0 });
    B.push({ type: 'brick_1x1', color: 'lgray', x: i,  y: top, z:  2, rot: 0 });
    B.push({ type: 'brick_1x1', color: 'lgray', x: -3, y: top, z: i,  rot: 0 });
    B.push({ type: 'brick_1x1', color: 'lgray', x:  2, y: top, z: i,  rot: 0 });
  }
  B.push({ type: 'brick_1x1', color: 'red', x: 0, y: top, z: 0, rot: 0 });
  B.push({ type: 'plate_1x2', color: 'red', x: 0, y: top + 3, z: 0, rot: 0 });
  return B;
}

// ---------- 5. Rainbow Tower ----------
function rainbow() {
  const B = [];
  const colors = ['red','orange','yellow','lime','green','azure','blue','purple','pink'];
  for (let i = 0; i < colors.length; i++) {
    B.push({ type: 'brick_2x2', color: colors[i], x: -1, y: i * 3, z: -1, rot: 0 });
    if (i < colors.length - 1) {
      B.push({ type: 'plate_2x2', color: colors[i+1], x: -1, y: i * 3 + 3, z: -1, rot: 0 });
    }
  }
  return B;
}

// ---------- 6. Tiny Dog ----------
function dog() {
  const B = [];
  B.push({ type: 'brick_2x4', color: 'brown', x: -2, y: 0, z: -1, rot: 0 });
  B.push({ type: 'brick_2x2', color: 'brown', x: -2, y: 3, z: -1, rot: 0 });
  B.push({ type: 'brick_1x2', color: 'brown', x:  0, y: 3, z: -1, rot: 0 });
  B.push({ type: 'brick_2x2', color: 'brown', x: -3, y: 3, z: -1, rot: 0 });
  B.push({ type: 'brick_1x2', color: 'brown', x: -4, y: 3, z: -1, rot: 0 });
  B.push({ type: 'brick_1x1', color: 'brown', x: -2, y: 0, z: -2, rot: 0 });
  B.push({ type: 'brick_1x1', color: 'brown', x: -2, y: 0, z:  1, rot: 0 });
  B.push({ type: 'brick_1x1', color: 'brown', x:  1, y: 0, z: -2, rot: 0 });
  B.push({ type: 'brick_1x1', color: 'brown', x:  1, y: 0, z:  1, rot: 0 });
  B.push({ type: 'slope_1x1', color: 'brown', x: -3, y: 6, z: -1, rot: 2 });
  B.push({ type: 'slope_1x1', color: 'brown', x: -3, y: 6, z:  0, rot: 2 });
  B.push({ type: 'brick_1x1', color: 'black', x: -4, y: 4, z: -1, rot: 0 });
  B.push({ type: 'brick_1x1', color: 'black', x: -4, y: 4, z:  0, rot: 0 });
  B.push({ type: 'plate_1x2', color: 'brown', x: 2, y: 2, z: -1, rot: 1 });
  return B;
}

const SEEDS = [
  { name: 'Red Racecar',       description: 'A classic red speedster with a windshield and spoiler. Edit the color to make your own F1 livery!', author: 'BrickWizard',       bricks: racecar(), likes: 48, views: 230 },
  { name: 'Cozy Little House', description: 'A 6×6 studio home with a door, window, and a brown pitched roof. Great starter build.',           author: 'PlateCaptain',      bricks: house(),   likes: 34, views: 152 },
  { name: 'Pixel Heart',       description: 'A flat pixel-art heart in 1×1 red bricks. Perfect Valentine gift.',                                author: 'StudBandit',        bricks: heart(),   likes: 91, views: 410 },
  { name: 'Micro Castle',      description: 'A tiny stone keep with battlements and a flag on top.',                                            author: 'TileArchitect',     bricks: castle(),  likes: 62, views: 301 },
  { name: 'Rainbow Tower',     description: 'Stack every color of the rainbow. Study in the palette.',                                          author: 'BricklyEngineer',   bricks: rainbow(), likes: 27, views: 180 },
  { name: 'Tiny Brown Dog',    description: 'A loyal little puppy. 14 bricks. Pair with the house.',                                            author: 'SnapFan',           bricks: dog(),     likes: 71, views: 388 },
];

(async () => {
  if (!process.env.TURSO_DATABASE_URL) {
    console.error('Error: TURSO_DATABASE_URL is not set. Copy .env.example to .env and fill in your Turso credentials first.');
    process.exit(1);
  }

  console.log('Clearing existing creations…');
  await q.clearAll();

  for (const s of SEEDS) {
    const row = await q.insert({
      name: s.name,
      description: s.description,
      author: s.author,
      data: JSON.stringify({ bricks: s.bricks }),
      thumbnail: null,
      parent_id: null,
      brick_count: s.bricks.length,
    });
    await q.setStats(row.id, s.likes, s.views);
    console.log(`  +  #${row.id}  ${s.name}  (${s.bricks.length} bricks)`);
  }

  console.log(`\nSeeded ${SEEDS.length} creations. Visit / to see them.`);
  process.exit(0);
})().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
