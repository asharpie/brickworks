// Brickworks — 3D Builder
//
// Architecture:
//   state.bricks: Array of placed bricks
//     { id: unique-number, type, color, x, y, z, rot }
//   state.history: undo/redo stack of { do, undo } actions
//
//   scene: Three.js scene
//   meshIndex[id]: Map from brick id to THREE.Group for lookup during edit/delete
//   ghostMesh: translucent preview of the brick to be placed
//
// Placement:
//   We raycast the mouse against two targets:
//     - the baseplate (for y=0 placement)
//     - existing brick meshes (for stacking)
//   Then snap the hit point to the stud grid. Before placing, we check
//   occupancy against any brick whose y-range overlaps with the new brick.

(function () {
  const THREE = window.THREE;
  const { STUD, PLATE, COLORS, COLOR_MAP, BRICKS, BRICK_MAP, CATEGORIES,
          buildBrickMesh, placeMesh, footprint, occupancy, topAtCell,
          slopeAngleRad } = window.Bricks;

  // -------- baseplate config --------
  const BASEPLATE_SIZE = 32; // in studs
  const WORLD_SIZE = BASEPLATE_SIZE * STUD;

  // -------- state --------
  let nextId = 1;
  const state = {
    bricks: [],
    selectedType: 'brick_2x4',
    selectedColor: 'red',
    tool: 'place',
    rot: 0,
    loadedId: null,   // server id if editing
    loadedAuthor: null,
    past: [],         // undo stack
    future: [],       // redo stack
    layerLimit: null, // null = show all
  };
  const meshIndex = new Map();

  // -------- scene setup --------
  const canvas = document.getElementById('stage-canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x1a1f2b);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1f2b);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);
  const CAMERA_HOME = new THREE.Vector3(18, 18, 18);
  camera.position.copy(CAMERA_HOME);
  camera.lookAt(0, 0, 0);

  const controls = new THREE.OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.mouseButtons = {
    LEFT:   null,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT:  THREE.MOUSE.ROTATE,
  };
  controls.touches = {
    ONE: THREE.TOUCH.ROTATE,
    TWO: THREE.TOUCH.DOLLY_PAN,
  };

  // Lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const sun = new THREE.DirectionalLight(0xffffff, 0.85);
  sun.position.set(15, 22, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -20;
  sun.shadow.camera.right = 20;
  sun.shadow.camera.top = 20;
  sun.shadow.camera.bottom = -20;
  sun.shadow.camera.near = 0.1;
  sun.shadow.camera.far = 80;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xb0cdf0, 0.3);
  fill.position.set(-10, 6, -8);
  scene.add(fill);

  // Baseplate
  const baseplateGeom = new THREE.BoxGeometry(WORLD_SIZE, PLATE, WORLD_SIZE);
  const baseplateMat = new THREE.MeshStandardMaterial({ color: 0x4e8742, roughness: 0.9 });
  const baseplate = new THREE.Mesh(baseplateGeom, baseplateMat);
  baseplate.position.y = -PLATE / 2;
  baseplate.receiveShadow = true;
  baseplate.userData.isBaseplate = true;
  scene.add(baseplate);

  // Baseplate studs (visual flavor — slight perf cost, but tiny)
  const baseStudGeom = new THREE.CylinderGeometry(0.22, 0.22, 0.1, 14);
  const baseStudMat = new THREE.MeshStandardMaterial({ color: 0x4e8742, roughness: 0.8 });
  const studInst = new THREE.InstancedMesh(baseStudGeom, baseStudMat, BASEPLATE_SIZE * BASEPLATE_SIZE);
  studInst.receiveShadow = true;
  const tmpMat = new THREE.Matrix4();
  let idx = 0;
  for (let i = 0; i < BASEPLATE_SIZE; i++) {
    for (let j = 0; j < BASEPLATE_SIZE; j++) {
      const x = (-BASEPLATE_SIZE / 2 + i + 0.5) * STUD;
      const z = (-BASEPLATE_SIZE / 2 + j + 0.5) * STUD;
      tmpMat.makeTranslation(x, 0.05, z);
      studInst.setMatrixAt(idx++, tmpMat);
    }
  }
  scene.add(studInst);

  // Grid overlay (snap grid)
  const gridGroup = new THREE.Group();
  const gridMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12 });
  for (let i = -BASEPLATE_SIZE / 2; i <= BASEPLATE_SIZE / 2; i++) {
    const g1 = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(i * STUD, 0.01, -WORLD_SIZE / 2),
      new THREE.Vector3(i * STUD, 0.01,  WORLD_SIZE / 2),
    ]);
    const g2 = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-WORLD_SIZE / 2, 0.01, i * STUD),
      new THREE.Vector3( WORLD_SIZE / 2, 0.01, i * STUD),
    ]);
    gridGroup.add(new THREE.Line(g1, gridMat));
    gridGroup.add(new THREE.Line(g2, gridMat));
  }
  scene.add(gridGroup);

  // Ghost (hover preview)
  let ghostMesh = null;
  let lastGhostKey = null;

  function updateGhost() {
    const brick = BRICK_MAP[state.selectedType];
    const color = state.selectedColor;
    const key = `${brick.id}:${color}:${state.rot}`;
    if (lastGhostKey === key && ghostMesh) return;
    if (ghostMesh) {
      scene.remove(ghostMesh);
      ghostMesh.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    }
    ghostMesh = buildBrickMesh(brick, color, { withEdges: false });
    ghostMesh.traverse(o => {
      if (o.material) {
        o.material = o.material.clone();
        o.material.transparent = true;
        o.material.opacity = 0.55;
      }
      o.castShadow = false;
      o.receiveShadow = false;
    });
    ghostMesh.visible = false;
    scene.add(ghostMesh);
    lastGhostKey = key;
  }

  // -------- occupancy & placement --------

  // A placed brick occupies cells [x..x+w-1] × [z..z+d-1] for y..y+h-1 plates.
  function bricksAtCell(cellX, cellZ) {
    const result = [];
    for (const b of state.bricks) {
      const brick = BRICK_MAP[b.type];
      const { w, d } = footprint(brick, b.rot);
      if (cellX >= b.x && cellX < b.x + w &&
          cellZ >= b.z && cellZ < b.z + d) {
        result.push(b);
      }
    }
    return result;
  }

  // Highest plate-y occupied at a given stud cell. Slopes contribute a per-cell
  // top height that matches the slanted surface, so pieces placed above the
  // low end of a slope don't float at the high end's bounding-box top.
  // Returns 0 (= baseplate) if nothing's there.
  function heightAtCell(cellX, cellZ) {
    let h = 0;
    for (const b of bricksAtCell(cellX, cellZ)) {
      const bb = BRICK_MAP[b.type];
      const top = b.y + topAtCell(bb, b.rot, b.x, b.z, cellX, cellZ);
      if (top > h) h = top;
    }
    return h;
  }

  // Highest plate-y across a footprint (for stacking onto uneven top)
  function highestTopUnderFootprint(cells) {
    let h = 0;
    for (const [cx, cz] of cells) {
      const at = heightAtCell(cx, cz);
      if (at > h) h = at;
    }
    return h;
  }

  // Figure out whether a to-be-placed piece should tilt to match a slope
  // beneath it. Returns { axis, angle, slope } if the ENTIRE footprint sits
  // on a single slope brick's top surface, otherwise null. Slope pieces
  // themselves never tilt (stacking slopes on slopes is out of scope here).
  //
  // The axis/angle mapping (derived by following how the slope's local +x
  // descent direction is rotated into world space):
  //    slope.rot 0 → tilt axis Z, angle -slopeAngle
  //    slope.rot 1 → tilt axis X, angle +slopeAngle
  //    slope.rot 2 → tilt axis Z, angle +slopeAngle
  //    slope.rot 3 → tilt axis X, angle -slopeAngle
  function computeSlopeTilt(brick, rot, x, z, ignoreId = null) {
    if (!brick || brick.kind === 'slope') return null;
    const { w, d } = footprint(brick, rot);
    let slopeUnder = null;
    for (let di = 0; di < w; di++) {
      for (let dj = 0; dj < d; dj++) {
        const cx = x + di, cz = z + dj;
        let topB = null, topH = -Infinity;
        for (const b of state.bricks) {
          if (ignoreId !== null && b.id === ignoreId) continue;
          const bb = BRICK_MAP[b.type];
          const bF = footprint(bb, b.rot);
          if (cx < b.x || cx >= b.x + bF.w || cz < b.z || cz >= b.z + bF.d) continue;
          const bTop = b.y + topAtCell(bb, b.rot, b.x, b.z, cx, cz);
          if (bTop > topH) { topB = b; topH = bTop; }
        }
        if (!topB) return null;
        if (BRICK_MAP[topB.type].kind !== 'slope') return null;
        if (slopeUnder === null) slopeUnder = topB;
        else if (slopeUnder.id !== topB.id) return null;
      }
    }
    if (!slopeUnder) return null;
    const slope = BRICK_MAP[slopeUnder.type];
    const angle = slopeAngleRad(slope);
    const r = ((slopeUnder.rot % 4) + 4) % 4;
    switch (r) {
      case 0: return { axis: 'z', angle: -angle, slope: slopeUnder };
      case 1: return { axis: 'x', angle:  angle, slope: slopeUnder };
      case 2: return { axis: 'z', angle:  angle, slope: slopeUnder };
      default: return { axis: 'x', angle: -angle, slope: slopeUnder }; // r === 3
    }
  }

  // True if the proposed placement intersects any existing brick.
  //
  // Per-cell vertical-interval check: at every cell the new brick covers, we
  // compute the new top and every overlapping existing brick's top (both use
  // topAtCell so slopes shrink the interval at their low-end cells). Two
  // pieces collide at a cell only if their [y, top) intervals overlap. This
  // lets you stack onto the low end of a slope without the slope's high-end
  // bounding box counting as "occupied" at the low-end cells.
  //
  // When `tilt` is supplied, the new piece is tilted to match a slope below
  // (tilt.slope). In that case the new piece's BOTTOM at each cell follows
  // the slope's top surface — so a flat plate on a 2x1 slope occupies the
  // exact interval above the slope's surface rather than a flat band. The
  // slope brick itself is excluded from collision checks (we are sitting on
  // it, not colliding with it).
  function collides(newBrick, newRot, nx, ny, nz, ignoreId = null, tilt = null) {
    const { w: fpW, d: fpD } = footprint(newBrick, newRot);
    const slopeUnder = tilt ? tilt.slope : null;
    const slopeDef = slopeUnder ? BRICK_MAP[slopeUnder.type] : null;
    for (let di = 0; di < fpW; di++) {
      for (let dj = 0; dj < fpD; dj++) {
        const cx = nx + di, cz = nz + dj;
        let newBottom, newTopHere;
        if (slopeUnder) {
          newBottom = slopeUnder.y + topAtCell(slopeDef, slopeUnder.rot, slopeUnder.x, slopeUnder.z, cx, cz);
          newTopHere = newBottom + newBrick.h;
        } else {
          newBottom = ny;
          newTopHere = ny + topAtCell(newBrick, newRot, nx, nz, cx, cz);
        }
        for (const b of state.bricks) {
          if (ignoreId !== null && b.id === ignoreId) continue;
          if (slopeUnder && b.id === slopeUnder.id) continue;
          const bb = BRICK_MAP[b.type];
          const bF = footprint(bb, b.rot);
          if (cx < b.x || cx >= b.x + bF.w || cz < b.z || cz >= b.z + bF.d) continue;
          const bTop = b.y + topAtCell(bb, b.rot, b.x, b.z, cx, cz);
          if (b.y < newTopHere && bTop > newBottom) return true;
        }
      }
    }
    return false;
  }

  // Check bounds against the baseplate.
  function inBounds(cells) {
    const r = BASEPLATE_SIZE / 2;
    for (const [cx, cz] of cells) {
      if (cx < -r || cx >= r || cz < -r || cz >= r) return false;
    }
    return true;
  }

  // -------- raycasting --------
  const raycaster = new THREE.Raycaster();
  const mouseVec = new THREE.Vector2();
  const _tmpPlane = new THREE.Plane();
  const _tmpVec3  = new THREE.Vector3();
  const _planeNormal = new THREE.Vector3(0, 1, 0);

  function screenToPlacement(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    mouseVec.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouseVec.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouseVec, camera);

    // Collect hit targets: baseplate + all brick meshes (not the ghost)
    const targets = [baseplate];
    for (const mesh of meshIndex.values()) targets.push(mesh);

    const hits = raycaster.intersectObjects(targets, true);
    if (hits.length === 0) return null;

    // Prefer a hit with a mostly-upward-facing normal (a flat top surface).
    // The stud cylinders are 20-sided approximations, and when the ray skims
    // their curved sides the hit point quantizes to facet boundaries — that
    // can make the ghost visibly skip studs. Flat-top hits are always smooth.
    let hit = hits[0];
    for (const h of hits) {
      if (h.face && h.face.normal && h.face.normal.y > 0.9) { hit = h; break; }
    }

    // Determine the brick we're hitting (walking up the parent chain).
    let hitBrickId = null;
    let hitObj = hit.object;
    while (hitObj) {
      if (hitObj.userData && hitObj.userData.brickId !== undefined) {
        hitBrickId = hitObj.userData.brickId;
        break;
      }
      hitObj = hitObj.parent;
    }

    const brick = BRICK_MAP[state.selectedType];
    const { w, d } = footprint(brick, state.rot);

    // Re-project the mouse ray onto a perfectly flat horizontal plane at the
    // hit's y. This gives continuous, smooth hp.x/hp.z as the cursor moves —
    // without this, stud cylinders can bias the hit point toward their centers
    // and cause the ghost to snap in 2-stud increments instead of 1.
    _tmpPlane.setFromNormalAndCoplanarPoint(_planeNormal, hit.point);
    const smooth = raycaster.ray.intersectPlane(_tmpPlane, _tmpVec3);
    const hp = smooth || hit.point;

    // Snap stud coords: compute the stud the hit point lies on, then
    // subtract half the footprint so the brick is centered on the cursor.
    const studX = Math.round(hp.x / STUD - w / 2);
    const studZ = Math.round(hp.z / STUD - d / 2);

    // Determine Y from the ENTIRE footprint at the current rotation, not just
    // the cursor's hit. The cursor might be over the baseplate, but if any
    // part of the brick's footprint overlaps a neighbor, the brick should sit
    // on top of that neighbor rather than trying to rest at y=0 (which would
    // collide). highestTopUnderFootprint already returns 0 when no cell has
    // anything beneath it, so this collapses the old two-branch logic.
    //
    // If the footprint sits entirely on a slope, y becomes the AVERAGE top
    // across the footprint — combined with the tilt applied by placeMesh,
    // this makes the piece's tilted bottom match the slope's slanted top
    // (instead of hovering at the high end of the slope as a flat piece).
    const cells = occupancy(brick, state.rot, studX, studZ);
    const tilt = computeSlopeTilt(brick, state.rot, studX, studZ);
    let yPlates;
    if (tilt) {
      let sum = 0;
      for (const [cx, cz] of cells) sum += heightAtCell(cx, cz);
      yPlates = sum / cells.length;
    } else {
      yPlates = highestTopUnderFootprint(cells);
    }

    return { cellX: studX, cellZ: studZ, y: yPlates, tilt, hitBrickId };
  }

  // -------- action history --------
  function doAction(action) {
    action.do();
    state.past.push(action);
    state.future.length = 0;
    updateStats();
  }

  function undo() {
    const a = state.past.pop();
    if (!a) return;
    a.undo();
    state.future.push(a);
    updateStats();
  }

  function redo() {
    const a = state.future.pop();
    if (!a) return;
    a.do();
    state.past.push(a);
    updateStats();
  }

  // -------- CRUD on bricks --------
  function addBrick({ type, color, x, y, z, rot }) {
    const brick = BRICK_MAP[type];
    if (!brick) return null;
    const cells = occupancy(brick, rot, x, z);
    const tilt = computeSlopeTilt(brick, rot, x, z);
    if (!inBounds(cells) || collides(brick, rot, x, y, z, null, tilt)) return null;
    const id = nextId++;
    const record = { id, type, color, x, y, z, rot };
    state.bricks.push(record);

    const mesh = buildBrickMesh(brick, color);
    placeMesh(mesh, brick, x, y, z, rot, tilt);
    mesh.traverse(o => {
      o.userData.brickId = id;
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
    });
    scene.add(mesh);
    meshIndex.set(id, mesh);
    applyLayerVisibility();
    return record;
  }

  function removeBrick(id) {
    const i = state.bricks.findIndex(b => b.id === id);
    if (i < 0) return null;
    const [removed] = state.bricks.splice(i, 1);
    const mesh = meshIndex.get(id);
    if (mesh) {
      scene.remove(mesh);
      mesh.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
      meshIndex.delete(id);
    }
    return removed;
  }

  // Rotate an already-placed brick to `newRot` (0..3).
  // Pivots around the brick's center (snapped to the grid) so it visually
  // spins in place rather than swinging around a corner. Returns the previous
  // {rot, x, z} so the caller can build an undo action, or null if blocked.
  function rotatePlaced(id, newRot) {
    const b = state.bricks.find(x => x.id === id);
    if (!b) return null;
    const brick = BRICK_MAP[b.type];
    const oldF = footprint(brick, b.rot);
    const newF = footprint(brick, newRot);
    // Keep the center approximately fixed across the rotation.
    const cx = b.x + oldF.w / 2;
    const cz = b.z + oldF.d / 2;
    const newX = Math.round(cx - newF.w / 2);
    const newZ = Math.round(cz - newF.d / 2);
    const newCells = occupancy(brick, newRot, newX, newZ);
    if (!inBounds(newCells)) return null;
    const tilt = computeSlopeTilt(brick, newRot, newX, newZ, id);
    if (collides(brick, newRot, newX, b.y, newZ, id, tilt)) return null;

    const prev = { rot: b.rot, x: b.x, z: b.z };
    b.rot = newRot; b.x = newX; b.z = newZ;
    const mesh = meshIndex.get(id);
    if (mesh) placeMesh(mesh, brick, newX, b.y, newZ, newRot, tilt);
    return prev;
  }

  // Build a do/undo action for a +90° rotation and push it onto the history,
  // or toast an error if it's blocked.
  function rotateBrickAction(id) {
    const b = state.bricks.find(x => x.id === id);
    if (!b) return;
    const nextRot = (b.rot + 1) % 4;
    // Dry-run the rotation to check for blockage before we mutate anything.
    const brick = BRICK_MAP[b.type];
    const oldF = footprint(brick, b.rot);
    const newF = footprint(brick, nextRot);
    const cx = b.x + oldF.w / 2;
    const cz = b.z + oldF.d / 2;
    const newX = Math.round(cx - newF.w / 2);
    const newZ = Math.round(cz - newF.d / 2);
    const newCells = occupancy(brick, nextRot, newX, newZ);
    const nextTilt = computeSlopeTilt(brick, nextRot, newX, newZ, id);
    if (!inBounds(newCells) || collides(brick, nextRot, newX, b.y, newZ, id, nextTilt)) {
      UI.toast('Can’t rotate — blocked or out of bounds', 'error');
      return;
    }
    const prevState = { rot: b.rot, x: b.x, z: b.z };
    const nextState = { rot: nextRot, x: newX, z: newZ };
    doAction({
      do:   () => { rotatePlacedTo(id, nextState); },
      undo: () => { rotatePlacedTo(id, prevState); },
    });
  }

  // Apply a precomputed {rot, x, z} to an existing brick (used by the action
  // do/undo pair above — skips the collision check since it was already done).
  function rotatePlacedTo(id, target) {
    const b = state.bricks.find(x => x.id === id);
    if (!b) return;
    const brick = BRICK_MAP[b.type];
    b.rot = target.rot; b.x = target.x; b.z = target.z;
    const tilt = computeSlopeTilt(brick, b.rot, b.x, b.z, id);
    const mesh = meshIndex.get(id);
    if (mesh) placeMesh(mesh, brick, b.x, b.y, b.z, b.rot, tilt);
  }

  function paintBrick(id, color) {
    const b = state.bricks.find(x => x.id === id);
    if (!b) return null;
    const prev = b.color;
    if (prev === color) return null;
    b.color = color;
    const mesh = meshIndex.get(id);
    if (mesh) {
      const hex = (COLOR_MAP[color] && COLOR_MAP[color].hex) || '#C4281C';
      mesh.traverse(o => {
        if (o.isMesh && o.material && o.material.color) {
          o.material = o.material.clone();
          o.material.color.set(hex);
        }
      });
    }
    return prev;
  }

  // -------- UI wiring --------
  const categoriesEl = document.getElementById('brick-categories');
  const brickListEl = document.getElementById('brick-list');
  const colorsEl = document.getElementById('color-swatches');
  const saveStatus = document.getElementById('save-status');

  let activeCategory = 'Bricks';
  function renderCategories() {
    categoriesEl.innerHTML = CATEGORIES.map(c =>
      `<button data-cat="${c}" class="${c === activeCategory ? 'active' : ''}">${c}</button>`).join('');
    categoriesEl.querySelectorAll('button').forEach(btn => {
      btn.onclick = () => { activeCategory = btn.dataset.cat; renderCategories(); renderBricks(); };
    });
  }
  function renderBricks() {
    const items = BRICKS.filter(b => b.category === activeCategory);
    brickListEl.innerHTML = items.map(b =>
      `<button class="brick-tile ${b.id === state.selectedType ? 'active' : ''}" data-id="${b.id}">
         <span class="mini"></span>${b.w}×${b.d}${b.h === 1 ? ' Plate' : ''}
       </button>`).join('');
    brickListEl.querySelectorAll('.brick-tile').forEach(btn => {
      btn.onclick = () => { state.selectedType = btn.dataset.id; renderBricks(); updateGhost(); };
    });
  }
  function renderColors() {
    colorsEl.innerHTML = COLORS.map(c =>
      `<div class="color-swatch ${c.id === state.selectedColor ? 'active' : ''}"
            data-id="${c.id}" style="background:${c.hex}" title="${c.name}"></div>`).join('');
    colorsEl.querySelectorAll('.color-swatch').forEach(sw => {
      sw.onclick = () => { state.selectedColor = sw.dataset.id; renderColors(); updateGhost(); };
    });
  }
  renderCategories();
  renderBricks();
  renderColors();
  updateGhost();

  // Tool buttons
  document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
    btn.onclick = () => {
      state.tool = btn.dataset.tool;
      document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.toggle('active', b === btn));
      ghostMesh.visible = (state.tool === 'place');
    };
  });
  document.querySelectorAll('.tool-btn[data-rot]').forEach(btn => {
    btn.onclick = () => {
      state.rot = parseInt(btn.dataset.rot, 10);
      document.querySelectorAll('.tool-btn[data-rot]').forEach(b => b.classList.toggle('active', b === btn));
      updateGhost();
    };
  });

  // History buttons
  document.getElementById('undo-btn').onclick = undo;
  document.getElementById('redo-btn').onclick = redo;

  // View buttons
  document.getElementById('view-reset').onclick = () => { camera.position.copy(CAMERA_HOME); controls.target.set(0,0,0); };
  document.getElementById('view-top').onclick = () => { camera.position.set(0, 30, 0.01); controls.target.set(0,0,0); };
  document.getElementById('view-iso').onclick = () => { camera.position.copy(CAMERA_HOME); controls.target.set(0,0,0); };
  document.getElementById('view-front').onclick = () => { camera.position.set(0, 6, 26); controls.target.set(0,0,0); };

  const gridToggle = document.getElementById('toggle-grid');
  gridToggle.onclick = () => {
    gridGroup.visible = !gridGroup.visible;
    gridToggle.classList.toggle('active', gridGroup.visible);
  };

  // Layer slider
  const layerSlider = document.getElementById('layer-slider');
  const layerLabel = document.getElementById('layer-label');
  layerSlider.oninput = () => {
    const v = parseInt(layerSlider.value, 10);
    state.layerLimit = (v >= 30) ? null : v;
    layerLabel.textContent = state.layerLimit === null ? 'All' : `y ≤ ${v}`;
    applyLayerVisibility();
  };
  function applyLayerVisibility() {
    for (const b of state.bricks) {
      const mesh = meshIndex.get(b.id);
      if (!mesh) continue;
      mesh.visible = (state.layerLimit === null) ? true : (b.y <= state.layerLimit);
    }
  }

  // Clear
  document.getElementById('clear-btn').onclick = () => {
    if (state.bricks.length === 0) return;
    if (!confirm(`Clear all ${state.bricks.length} bricks?`)) return;
    // Record a bulk undo.
    const snapshot = state.bricks.slice();
    doAction({
      do: () => { for (const b of snapshot) removeBrick(b.id); },
      undo: () => { for (const b of snapshot) addBrick(b); },
    });
  };

  // Name/description fields
  const nameField = document.getElementById('name-field');
  const descField = document.getElementById('desc-field');

  // ---- stats ----
  function updateStats() {
    document.getElementById('brick-count').textContent = `${state.bricks.length} brick${state.bricks.length === 1 ? '' : 's'}`;
  }
  updateStats();

  // -------- pointer interaction --------
  let isPointerDown = false;
  let suppressClick = false; // set true if right-drag is happening
  let hoveredBrickId = null; // most recent brick under the cursor — used for Shift+R

  canvas.addEventListener('pointermove', e => {
    // Always track what's under the cursor so keyboard shortcuts can target it.
    const pAny = screenToPlacement(e.clientX, e.clientY);
    hoveredBrickId = pAny ? pAny.hitBrickId : null;

    if (state.tool !== 'place') { ghostMesh.visible = false; return; }
    const p = pAny;
    if (!p) { ghostMesh.visible = false; return; }
    const brick = BRICK_MAP[state.selectedType];
    const cells = occupancy(brick, state.rot, p.cellX, p.cellZ);
    const ok = inBounds(cells) && !collides(brick, state.rot, p.cellX, p.y, p.cellZ, null, p.tilt);
    ghostMesh.visible = true;
    placeMesh(ghostMesh, brick, p.cellX, p.y, p.cellZ, state.rot, p.tilt);
    ghostMesh.traverse(o => {
      if (o.material && o.material.color) {
        o.material.color.set(ok
          ? (COLOR_MAP[state.selectedColor] && COLOR_MAP[state.selectedColor].hex) || '#ffffff'
          : 0xff3333);
      }
    });
  });

  canvas.addEventListener('pointerdown', e => {
    if (e.button === 2) { suppressClick = true; return; }
    isPointerDown = true;
    suppressClick = false;
  });

  canvas.addEventListener('pointerup', e => {
    isPointerDown = false;
    if (suppressClick || e.button !== 0) { suppressClick = false; return; }
    handleClick(e);
  });

  canvas.addEventListener('contextmenu', e => e.preventDefault());

  function handleClick(e) {
    const p = screenToPlacement(e.clientX, e.clientY);
    if (!p) return;
    if (e.shiftKey || state.tool === 'erase') {
      if (p.hitBrickId == null) return;
      const b = state.bricks.find(x => x.id === p.hitBrickId);
      if (!b) return;
      const snap = { ...b };
      doAction({
        do: () => removeBrick(snap.id),
        undo: () => addBrick(snap),
      });
      return;
    }
    if (state.tool === 'paint') {
      if (p.hitBrickId == null) return;
      const b = state.bricks.find(x => x.id === p.hitBrickId);
      if (!b) return;
      const prev = b.color;
      const next = state.selectedColor;
      if (prev === next) return;
      doAction({
        do: () => paintBrick(b.id, next),
        undo: () => paintBrick(b.id, prev),
      });
      return;
    }
    if (state.tool === 'rotate') {
      if (p.hitBrickId == null) return;
      rotateBrickAction(p.hitBrickId);
      return;
    }
    // place
    const brick = BRICK_MAP[state.selectedType];
    const cells = occupancy(brick, state.rot, p.cellX, p.cellZ);
    if (!inBounds(cells) || collides(brick, state.rot, p.cellX, p.y, p.cellZ, null, p.tilt)) {
      UI.toast('Can’t place there', 'error');
      return;
    }
    const spec = {
      type: state.selectedType,
      color: state.selectedColor,
      x: p.cellX,
      z: p.cellZ,
      y: p.y,
      rot: state.rot,
    };
    doAction({
      do: () => { const r = addBrick(spec); spec.id = r.id; },
      undo: () => { removeBrick(spec.id); },
    });
  }

  // Keyboard shortcuts
  window.addEventListener('keydown', e => {
    const inInput = /input|textarea/i.test(e.target.tagName);
    if (inInput) return;
    if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
      return;
    }
    if ((e.key === 'y' || e.key === 'Y') && (e.ctrlKey || e.metaKey)) {
      e.preventDefault(); redo(); return;
    }
    if (e.key === 'r' || e.key === 'R') {
      // Shift+R: rotate the brick currently under the cursor in place.
      // Plain R: cycle the rotation used for the next brick to place.
      if (e.shiftKey && hoveredBrickId != null) {
        rotateBrickAction(hoveredBrickId);
      } else {
        state.rot = (state.rot + 1) % 4;
        document.querySelectorAll('.tool-btn[data-rot]').forEach(b =>
          b.classList.toggle('active', parseInt(b.dataset.rot, 10) === state.rot));
        updateGhost();
      }
    }
    if (e.key === 'Escape') {
      state.tool = 'place';
      document.querySelectorAll('.tool-btn[data-tool]').forEach(b =>
        b.classList.toggle('active', b.dataset.tool === 'place'));
    }
  });

  // -------- save / load / export / import --------

  function captureThumbnail() {
    // Hide the ghost temporarily, render one frame at a known size, then return data URL.
    const prevVis = ghostMesh.visible;
    const prevGrid = gridGroup.visible;
    ghostMesh.visible = false;
    gridGroup.visible = false;
    renderer.render(scene, camera);
    const url = renderer.domElement.toDataURL('image/png');
    ghostMesh.visible = prevVis;
    gridGroup.visible = prevGrid;
    return url;
  }

  async function save() {
    const user = User.ensure();
    if (!user) return;
    if (state.bricks.length === 0) {
      UI.toast('Nothing to save yet', 'error');
      return;
    }
    const body = {
      name: nameField.value.trim() || 'Untitled',
      description: descField.value.trim(),
      author: user.name,
      bricks: state.bricks,
      thumbnail: captureThumbnail(),
    };
    try {
      let saved;
      if (state.loadedId && state.loadedAuthor === user.name) {
        saved = await API.update(state.loadedId, body);
      } else {
        saved = await API.create(body);
      }
      state.loadedId = saved.id;
      state.loadedAuthor = saved.author;
      saveStatus.textContent = `Saved as #${saved.id} · ${new Date().toLocaleTimeString()}`;
      UI.toast('Creation saved!', 'success');
      history.replaceState({}, '', `/builder?id=${saved.id}`);
    } catch (err) {
      UI.toast('Save failed: ' + err.message, 'error');
    }
  }

  document.getElementById('save-btn').onclick = save;

  document.getElementById('instructions-btn').onclick = async () => {
    if (state.bricks.length === 0) {
      UI.toast('Place some bricks first', 'error');
      return;
    }
    UI.toast('Generating instructions…');
    try {
      await Instructions.generatePDF({
        name: nameField.value.trim() || 'Untitled',
        author: User.get()?.name || 'anonymous',
        bricks: state.bricks,
      });
    } catch (err) {
      console.error(err);
      UI.toast('Instructions failed: ' + err.message, 'error');
    }
  };

  document.getElementById('export-btn').onclick = () => {
    const blob = new Blob(
      [JSON.stringify({ name: nameField.value, description: descField.value, bricks: state.bricks }, null, 2)],
      { type: 'application/json' }
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (nameField.value || 'creation') + '.json';
    a.click();
  };

  const importFile = document.getElementById('import-file');
  document.getElementById('import-btn').onclick = () => importFile.click();
  importFile.onchange = async () => {
    const f = importFile.files && importFile.files[0];
    if (!f) return;
    try {
      const text = await f.text();
      const parsed = JSON.parse(text);
      loadCreation(parsed);
      UI.toast('Imported!', 'success');
    } catch (err) {
      UI.toast('Import failed: ' + err.message, 'error');
    }
  };

  function loadCreation(c) {
    // Clear current
    for (const b of state.bricks.slice()) removeBrick(b.id);
    state.past.length = 0; state.future.length = 0;
    nameField.value = c.name || '';
    descField.value = c.description || '';
    const bricks = (c.bricks || []).slice().sort((a, b) => a.y - b.y);
    for (const b of bricks) addBrick({
      type: b.type,
      color: b.color,
      x: b.x, y: b.y, z: b.z,
      rot: b.rot || 0,
    });
    updateStats();
  }

  // Load an existing creation if ?id= is present (or ?clone=)
  async function loadFromUrl() {
    const params = new URLSearchParams(location.search);
    const editId = params.get('id');
    const cloneId = params.get('clone');
    if (editId) {
      try {
        const c = await API.get(editId);
        loadCreation(c);
        state.loadedId = c.id;
        state.loadedAuthor = c.author;
        saveStatus.textContent = `Editing #${c.id} (by ${c.author})`;
      } catch (err) {
        UI.toast('Could not load creation', 'error');
      }
    } else if (cloneId) {
      try {
        const c = await API.get(cloneId);
        loadCreation({ ...c, name: c.name + ' (remix)' });
        state.loadedId = null;
        state.loadedAuthor = null;
        saveStatus.textContent = `Cloned from #${c.id} (${c.author}) — saving will create a new creation.`;
      } catch (err) {
        UI.toast('Could not load creation', 'error');
      }
    }
  }
  loadFromUrl();

  User.mountHeader();

  // -------- main loop --------
  function onResize() {
    const r = canvas.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', onResize);
  onResize();

  function tick() {
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  tick();

  // Expose minimal API for testing
  window.Builder = { state, addBrick, removeBrick, loadCreation };
})();
