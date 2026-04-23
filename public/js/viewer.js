// Read-only 3D viewer — shared by the creation detail page and
// the instructions renderer.
//
// Usage:
//   const v = Viewer.mount(canvasEl, { withControls: true });
//   v.load(creation);            // { bricks: [...] }
//   v.setLayerLimit(5);          // show bricks with y <= 5
//   v.render();                  // force a render (for non-orbit usage)
//   v.captureImage();            // returns a data URL PNG of current frame

(function (global) {
  const THREE = global.THREE;

  function mount(canvas, opts = {}) {
    const { STUD, PLATE, BRICK_MAP, buildBrickMesh, placeMesh } = global.Bricks;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(opts.pixelRatio || (global.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(opts.background != null ? opts.background : 0x1a1f2b);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(opts.background != null ? opts.background : 0x1a1f2b);

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 1000);
    camera.position.set(14, 14, 14);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const sun = new THREE.DirectionalLight(0xffffff, 0.85);
    sun.position.set(10, 18, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -20;
    sun.shadow.camera.right = 20;
    sun.shadow.camera.top = 20;
    sun.shadow.camera.bottom = -20;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xb0cdf0, 0.3);
    fill.position.set(-10, 6, -8);
    scene.add(fill);

    // Ground disc (subtle)
    if (opts.groundPlate !== false) {
      const planeGeom = new THREE.CircleGeometry(40, 32);
      const planeMat = new THREE.MeshStandardMaterial({ color: 0x222833, roughness: 1 });
      const plane = new THREE.Mesh(planeGeom, planeMat);
      plane.rotation.x = -Math.PI / 2;
      plane.position.y = -0.001;
      plane.receiveShadow = true;
      scene.add(plane);
    }

    // Optional controls
    let controls = null;
    if (opts.withControls && THREE.OrbitControls) {
      controls = new THREE.OrbitControls(camera, canvas);
      controls.enableDamping = true;
      controls.dampingFactor = 0.1;
      controls.enablePan = false;
    }

    const group = new THREE.Group();
    scene.add(group);

    const api = {
      scene, camera, renderer, controls,
      load(creation) {
        while (group.children.length) {
          const c = group.children.pop();
          c.traverse(o => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) o.material.dispose && o.material.dispose();
          });
        }
        const bricks = (creation.bricks || []).slice().sort((a,b) => a.y - b.y);
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, maxY = 0;
        for (const b of bricks) {
          const brick = BRICK_MAP[b.type];
          if (!brick) continue;
          const mesh = buildBrickMesh(brick, b.color);
          placeMesh(mesh, brick, b.x, b.y, b.z, b.rot || 0);
          mesh.traverse(o => {
            if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
            o.userData.brickId = b.id;
          });
          mesh.userData.brickY = b.y;
          group.add(mesh);
          const { w, d } = global.Bricks.footprint(brick, b.rot || 0);
          minX = Math.min(minX, b.x); maxX = Math.max(maxX, b.x + w);
          minZ = Math.min(minZ, b.z); maxZ = Math.max(maxZ, b.z + d);
          maxY = Math.max(maxY, b.y + brick.h);
        }
        if (bricks.length) {
          // Center the group on origin and frame the camera.
          const cx = ((minX + maxX) / 2) * STUD;
          const cz = ((minZ + maxZ) / 2) * STUD;
          group.position.set(-cx, 0, -cz);
          const span = Math.max(maxX - minX, maxZ - minZ, maxY / 3) * STUD;
          const dist = Math.max(5, span * 1.6);
          camera.position.set(dist, dist * 0.9, dist);
          camera.lookAt(0, (maxY * PLATE) / 2, 0);
          if (controls) controls.target.set(0, (maxY * PLATE) / 2, 0);
        }
      },
      setLayerLimit(limit) {
        group.traverse(o => {
          if (o.userData && o.userData.brickId != null) {
            // do nothing here; layer limit handled by hiding whole groups
          }
        });
        // Set visibility on top-level brick groups
        for (const g of group.children) {
          if (!g.userData || g.userData.brickY == null) continue;
          g.visible = (limit == null) ? true : g.userData.brickY <= limit;
        }
      },
      resize(width, height) {
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      },
      render() {
        if (controls) controls.update();
        renderer.render(scene, camera);
      },
      tick() {
        if (controls) controls.update();
        renderer.render(scene, camera);
      },
      captureImage() {
        renderer.render(scene, camera);
        return renderer.domElement.toDataURL('image/png');
      },
      dispose() {
        renderer.dispose && renderer.dispose();
      },
    };

    return api;
  }

  global.Viewer = { mount };
})(window);
