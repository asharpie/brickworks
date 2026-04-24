// Brickworks — shared brick catalog, geometry helpers, and color palette.
//
// This file is the single source of truth for brick types, dimensions, and
// colors. It is used by the 3D editor, the read-only viewer, the instructions
// generator, and any server-side code that wants to validate a creation.
//
// Coordinate system:
//   - One "stud" is the unit of horizontal distance on the baseplate.
//   - One "plate" (1/3 of a brick height) is the vertical unit.
//   - Positions are integer (x, y, z) where x/z are studs and y is plates.
//   - Rotations are multiples of 90° (0, 1, 2, 3).
//
// Sizes are in LDraw-inspired units: 1 stud = 0.8 world units,
// 1 plate height = 0.32 world units, so a standard brick (3 plates) = 0.96.
// (These values chosen so Three.js camera distances feel comfortable.)

(function (global) {
  const STUD = 0.8;            // world units per stud
  const PLATE = 0.32;          // world units per plate (1/3 of a brick)
  const STUD_RADIUS = 0.24;    // stud radius on top of bricks
  const STUD_HEIGHT = 0.18;

  // 15-color classic LEGO-inspired palette.
  const COLORS = [
    { id: 'red',       name: 'Red',        hex: '#C4281C' },
    { id: 'orange',    name: 'Orange',     hex: '#E76F1E' },
    { id: 'yellow',    name: 'Yellow',     hex: '#F5CD2F' },
    { id: 'lime',      name: 'Lime',       hex: '#A5CA18' },
    { id: 'green',     name: 'Green',      hex: '#287F46' },
    { id: 'azure',     name: 'Azure',      hex: '#3CB4E7' },
    { id: 'blue',      name: 'Blue',       hex: '#1E5AA8' },
    { id: 'purple',    name: 'Purple',     hex: '#6C2E9C' },
    { id: 'pink',      name: 'Pink',       hex: '#E4ADC8' },
    { id: 'brown',     name: 'Brown',      hex: '#5A3826' },
    { id: 'tan',       name: 'Tan',        hex: '#D9BB7B' },
    { id: 'lgray',     name: 'Light Gray', hex: '#A0A5A9' },
    { id: 'dgray',     name: 'Dark Gray',  hex: '#545955' },
    { id: 'black',     name: 'Black',      hex: '#1B2A34' },
    { id: 'white',     name: 'White',      hex: '#F2F3F2' },
  ];
  const COLOR_MAP = Object.fromEntries(COLORS.map(c => [c.id, c]));

  // Brick category groupings for the picker UI.
  const CATEGORIES = ['Bricks', 'Plates', 'Tiles', 'Slopes', 'Round', 'Technic'];

  // Brick definitions.
  //
  // Each entry describes a piece:
  //   id       — stable identifier, stored in JSON
  //   name     — display name for the picker
  //   category — one of CATEGORIES
  //   w, d     — footprint in studs (width × depth at 0° rotation)
  //   h        — height in plates (brick = 3, plate/tile/slope top = 1)
  //   kind     — geometry generator: 'box', 'tile', 'slope', 'round', 'technic'
  //   studsTop — whether the top surface has studs
  //
  // Rotations multiply (w, d) when rot is odd (90 / 270 degrees).

  const BRICKS = [
    // Classic bricks (h=3)
    { id: 'brick_1x1', name: '1×1 Brick',  category: 'Bricks', w: 1, d: 1, h: 3, kind: 'box', studsTop: true },
    { id: 'brick_1x2', name: '1×2 Brick',  category: 'Bricks', w: 2, d: 1, h: 3, kind: 'box', studsTop: true },
    { id: 'brick_1x3', name: '1×3 Brick',  category: 'Bricks', w: 3, d: 1, h: 3, kind: 'box', studsTop: true },
    { id: 'brick_1x4', name: '1×4 Brick',  category: 'Bricks', w: 4, d: 1, h: 3, kind: 'box', studsTop: true },
    { id: 'brick_1x6', name: '1×6 Brick',  category: 'Bricks', w: 6, d: 1, h: 3, kind: 'box', studsTop: true },
    { id: 'brick_1x8', name: '1×8 Brick',  category: 'Bricks', w: 8, d: 1, h: 3, kind: 'box', studsTop: true },
    { id: 'brick_2x2', name: '2×2 Brick',  category: 'Bricks', w: 2, d: 2, h: 3, kind: 'box', studsTop: true },
    { id: 'brick_2x3', name: '2×3 Brick',  category: 'Bricks', w: 3, d: 2, h: 3, kind: 'box', studsTop: true },
    { id: 'brick_2x4', name: '2×4 Brick',  category: 'Bricks', w: 4, d: 2, h: 3, kind: 'box', studsTop: true },
    { id: 'brick_2x6', name: '2×6 Brick',  category: 'Bricks', w: 6, d: 2, h: 3, kind: 'box', studsTop: true },
    { id: 'brick_2x8', name: '2×8 Brick',  category: 'Bricks', w: 8, d: 2, h: 3, kind: 'box', studsTop: true },

    // Plates (h=1)
    { id: 'plate_1x1', name: '1×1 Plate',  category: 'Plates', w: 1, d: 1, h: 1, kind: 'box', studsTop: true },
    { id: 'plate_1x2', name: '1×2 Plate',  category: 'Plates', w: 2, d: 1, h: 1, kind: 'box', studsTop: true },
    { id: 'plate_1x4', name: '1×4 Plate',  category: 'Plates', w: 4, d: 1, h: 1, kind: 'box', studsTop: true },
    { id: 'plate_2x2', name: '2×2 Plate',  category: 'Plates', w: 2, d: 2, h: 1, kind: 'box', studsTop: true },
    { id: 'plate_2x4', name: '2×4 Plate',  category: 'Plates', w: 4, d: 2, h: 1, kind: 'box', studsTop: true },
    { id: 'plate_4x4', name: '4×4 Plate',  category: 'Plates', w: 4, d: 4, h: 1, kind: 'box', studsTop: true },

    // Tiles — flat-topped plates (h=1, no studs)
    { id: 'tile_1x1', name: '1×1 Tile',    category: 'Tiles', w: 1, d: 1, h: 1, kind: 'tile', studsTop: false },
    { id: 'tile_1x2', name: '1×2 Tile',    category: 'Tiles', w: 2, d: 1, h: 1, kind: 'tile', studsTop: false },
    { id: 'tile_2x2', name: '2×2 Tile',    category: 'Tiles', w: 2, d: 2, h: 1, kind: 'tile', studsTop: false },
    { id: 'tile_2x4', name: '2×4 Tile',    category: 'Tiles', w: 4, d: 2, h: 1, kind: 'tile', studsTop: false },

    // Slopes (h=3, one stud on top)
    { id: 'slope_1x1', name: '1×1 Slope',  category: 'Slopes', w: 1, d: 1, h: 3, kind: 'slope', studsTop: true },
    { id: 'slope_2x1', name: '2×1 Slope',  category: 'Slopes', w: 2, d: 1, h: 3, kind: 'slope', studsTop: true },
    { id: 'slope_2x2', name: '2×2 Slope',  category: 'Slopes', w: 2, d: 2, h: 3, kind: 'slope', studsTop: true },
    { id: 'slope_3x1', name: '3×1 Slope',  category: 'Slopes', w: 3, d: 1, h: 3, kind: 'slope', studsTop: true },

    // Round
    { id: 'round_1x1', name: '1×1 Round',  category: 'Round', w: 1, d: 1, h: 3, kind: 'round', studsTop: true },
    { id: 'round_2x2', name: '2×2 Round',  category: 'Round', w: 2, d: 2, h: 3, kind: 'round', studsTop: true },

    // Technic (simplified — brick with visible horizontal hole)
    { id: 'tech_1x2',  name: '1×2 Technic', category: 'Technic', w: 2, d: 1, h: 3, kind: 'technic', studsTop: true },
    { id: 'tech_1x4',  name: '1×4 Technic', category: 'Technic', w: 4, d: 1, h: 3, kind: 'technic', studsTop: true },
  ];

  const BRICK_MAP = Object.fromEntries(BRICKS.map(b => [b.id, b]));

  // Resolve footprint after rotation.
  function footprint(brick, rot = 0) {
    const r = ((rot % 4) + 4) % 4;
    return (r === 1 || r === 3) ? { w: brick.d, d: brick.w } : { w: brick.w, d: brick.d };
  }

  // Returns a plain list of [dx, dz] stud offsets occupied by the footprint.
  function occupancy(brick, rot = 0, x = 0, z = 0) {
    const { w, d } = footprint(brick, rot);
    const cells = [];
    for (let i = 0; i < w; i++) {
      for (let j = 0; j < d; j++) {
        cells.push([x + i, z + j]);
      }
    }
    return cells;
  }

  // Height in plates (possibly fractional) of a piece's top surface at the
  // given world stud cell (cx, cz). For flat-topped pieces this is just
  // `brick.h`. For slopes, the surface varies across the footprint: full h
  // at the "back" column and h*0.25 at the "front" column, with the surface
  // sampled at each cell's center so stacking lands on the slope, not on
  // the bounding-box top.
  //
  // Rotation mapping: the slope descends along the brick's LOCAL +x axis
  // (local_i=0 is high / back, local_i=brick.w-1 is low / front). We invert
  // the placeMesh rotation to recover local_i from a world cell offset.
  function topAtCell(brick, rot, bx, bz, cx, cz) {
    if (brick.kind !== 'slope') return brick.h;
    const r = ((rot % 4) + 4) % 4;
    const dx = cx - bx;
    const dz = cz - bz;
    let i;
    switch (r) {
      case 0: i = dx;                 break;
      case 1: i = dz;                 break;
      case 2: i = brick.w - 1 - dx;   break;
      default: i = brick.w - 1 - dz;  break; // r === 3
    }
    // Clamp just in case caller queries a cell outside the footprint.
    if (i < 0) i = 0;
    if (i > brick.w - 1) i = brick.w - 1;
    // Surface height in plates at column i (0 = high, w-1 = low).
    return brick.h * (1 - 0.75 * (i + 0.5) / brick.w);
  }

  // Core bounding-box geometry helper — shared by bricks, plates, technic, tiles.
  function makeBoxGeometry(w, d, hPlates, { tile = false, slope = false, round = false, technic = false } = {}) {
    const THREE = global.THREE;
    const width = w * STUD;
    const depth = d * STUD;
    const height = hPlates * PLATE;

    const group = new THREE.Group();

    if (slope) {
      // Build a slope as an extruded triangular prism along depth.
      // At depth side y=0..height, x goes from full width down to 0 along depth.
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(width, 0);
      shape.lineTo(width, height * 0.25); // small vertical wall at the front
      shape.lineTo(0, height);
      shape.closePath();
      const geom = new THREE.ExtrudeGeometry(shape, { depth: depth, bevelEnabled: false });
      const mesh = new THREE.Mesh(geom);
      // Center the extrusion on origin.
      mesh.position.set(-width / 2, -height / 2, -depth / 2);
      group.add(mesh);
    } else if (round) {
      const radius = Math.min(width, depth) / 2;
      const geom = new THREE.CylinderGeometry(radius, radius, height, 24);
      const mesh = new THREE.Mesh(geom);
      group.add(mesh);
    } else {
      const geom = new THREE.BoxGeometry(width, height, depth);
      const mesh = new THREE.Mesh(geom);
      group.add(mesh);

      if (technic) {
        // Add a visible hole as a ring on each long side.
        const holeRadius = PLATE * 0.75;
        const holeGeom = new THREE.TorusGeometry(holeRadius, holeRadius * 0.18, 12, 24);
        for (const z of [depth / 2 + 0.001, -depth / 2 - 0.001]) {
          for (let i = 0; i < w - 1; i++) {
            const ring = new THREE.Mesh(holeGeom);
            ring.rotation.x = Math.PI / 2;
            ring.position.set(-width / 2 + STUD * (i + 1), 0, z);
            group.add(ring);
          }
        }
      }
    }
    return { group, width, depth, height };
  }

  // Given a brick definition and a color, build the full Three.js group
  // (geometry + studs) centered on the origin. Pivot is at the center.
  //
  // color can be a palette id or a hex string.
  function buildBrickMesh(brick, colorId, opts = {}) {
    const THREE = global.THREE;
    const color = COLOR_MAP[colorId] ? COLOR_MAP[colorId].hex : (colorId || '#C4281C');
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.55,
      metalness: 0.0,
    });
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x000000, opacity: 0.35, transparent: true });

    const opts2 = {};
    if (brick.kind === 'tile')    opts2.tile = true;
    if (brick.kind === 'slope')   opts2.slope = true;
    if (brick.kind === 'round')   opts2.round = true;
    if (brick.kind === 'technic') opts2.technic = true;

    const { group, width, depth, height } = makeBoxGeometry(brick.w, brick.d, brick.h, opts2);

    // Apply color + edges to all child meshes.
    group.traverse(child => {
      if (child.isMesh) {
        child.material = mat;
        child.castShadow = true;
        child.receiveShadow = true;
        if (opts.withEdges !== false) {
          const edges = new THREE.EdgesGeometry(child.geometry, 18);
          const line = new THREE.LineSegments(edges, edgeMat);
          child.add(line);
        }
      }
    });

    // Add studs on top.
    if (brick.studsTop) {
      const studGeom = new THREE.CylinderGeometry(STUD_RADIUS, STUD_RADIUS, STUD_HEIGHT, 20);

      if (brick.kind === 'slope') {
        // Slopes: studs sit on the slanted surface, tilted so their axis
        // matches the surface normal, and one stud per footprint cell.
        // Slope descends from local x = -width/2 (high / back) to +width/2 (low / front).
        const rise = height * 0.75;               // vertical drop along the ramp
        const run = width;                        // horizontal length of the ramp
        const slopeAngle = Math.atan2(rise, run); // angle between ramp and floor
        const nx = Math.sin(slopeAngle);          // surface normal x component
        const ny = Math.cos(slopeAngle);          // surface normal y component
        for (let i = 0; i < brick.w; i++) {
          for (let j = 0; j < brick.d; j++) {
            const xAlongWidth = STUD * (i + 0.5);                       // from left (high) edge
            const surfYFromBottom = height - (xAlongWidth / width) * rise;
            const localX = -width / 2 + xAlongWidth;
            const localY = surfYFromBottom - height / 2;                // center-origin coords
            const localZ = -depth / 2 + STUD * (j + 0.5);
            const stud = new THREE.Mesh(studGeom, mat);
            stud.position.set(
              localX + nx * (STUD_HEIGHT / 2),
              localY + ny * (STUD_HEIGHT / 2),
              localZ
            );
            // Rotate around Z so the stud's Y axis aligns with the surface normal.
            stud.rotation.z = -slopeAngle;
            stud.castShadow = true;
            group.add(stud);
          }
        }
      } else if (brick.kind === 'round') {
        // Round: single centered stud.
        const stud = new THREE.Mesh(studGeom, mat);
        stud.position.set(0, height / 2 + STUD_HEIGHT / 2, 0);
        stud.castShadow = true;
        group.add(stud);
      } else {
        // Regular flat-topped pieces: grid of vertical studs.
        for (let i = 0; i < brick.w; i++) {
          for (let j = 0; j < brick.d; j++) {
            const stud = new THREE.Mesh(studGeom, mat);
            stud.position.set(
              -width / 2 + STUD * (i + 0.5),
              height / 2 + STUD_HEIGHT / 2,
              -depth / 2 + STUD * (j + 0.5)
            );
            stud.castShadow = true;
            group.add(stud);
          }
        }
      }
    }

    group.userData.brick = brick;
    group.userData.colorId = colorId;
    return group;
  }

  // Slope angle (radians) between the slanted face and the ground plane.
  // Fixed by the geometry: rise = h*PLATE*0.75, run = w*STUD.
  function slopeAngleRad(brick) {
    if (!brick || brick.kind !== 'slope') return 0;
    const rise = brick.h * PLATE * 0.75;
    const run = brick.w * STUD;
    return Math.atan2(rise, run);
  }

  // Position a mesh group at stud-grid coordinates.
  //
  // (x, z) is the lowest-index corner of the footprint after rotation.
  // y is in plates (0 is baseplate top). Typically y is the piece's flat
  // bottom; when `tilt` is supplied, y is the AVERAGE slope-surface height
  // across the footprint, so the piece sits on the slope at its midpoint.
  //
  // `tilt`, if set, is `{ axis: 'x' | 'z', angle: radians }` — a world-axis
  // rotation applied AFTER the usual Y (rot) rotation. Used to lay a flat
  // piece on a slope surface so its bottom follows the slope instead of
  // floating at the high end.
  function placeMesh(mesh, brick, x, y, z, rot = 0, tilt = null) {
    const THREE = global.THREE;
    const { w, d } = footprint(brick, rot);
    const half_h = (brick.h * PLATE) / 2;
    const tiltAngle = tilt ? tilt.angle : 0;
    const cosT = Math.cos(tiltAngle);
    const sinT = Math.sin(tiltAngle);

    // When tilted around a horizontal axis through the mesh center, the
    // bottom-center drifts horizontally. Offset the mesh position so the
    // bottom stays centered on the footprint's horizontal midpoint.
    let offX = 0, offZ = 0;
    if (tilt) {
      if (tilt.axis === 'z')      offX = -half_h * sinT;
      else if (tilt.axis === 'x') offZ =  half_h * sinT;
    }

    mesh.position.set(
      (x + w / 2) * STUD + offX,
      y * PLATE + half_h * cosT,
      (z + d / 2) * STUD + offZ
    );

    // Compose rotation: first the local Y spin from `rot`, then a world-axis
    // tilt (if any). Quaternion multiplication applies right-to-left, so
    // q = qTilt * qY applies qY first.
    const qY = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      -(rot * Math.PI) / 2
    );
    const q = new THREE.Quaternion();
    if (tilt) {
      const axisVec = tilt.axis === 'x'
        ? new THREE.Vector3(1, 0, 0)
        : new THREE.Vector3(0, 0, 1);
      q.setFromAxisAngle(axisVec, tilt.angle);
    }
    q.multiply(qY);
    mesh.quaternion.copy(q);
  }

  // World-units helpers, exposed for other modules.
  const units = { STUD, PLATE, STUD_RADIUS, STUD_HEIGHT };

  global.Bricks = {
    STUD, PLATE, units,
    COLORS, COLOR_MAP, CATEGORIES,
    BRICKS, BRICK_MAP,
    footprint, occupancy, topAtCell, slopeAngleRad,
    buildBrickMesh, placeMesh,
  };
})(typeof window !== 'undefined' ? window : globalThis);
