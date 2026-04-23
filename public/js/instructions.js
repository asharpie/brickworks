// Instructions generator.
//
// Strategy: group bricks by layer (y), chunk into small "steps" of up to
// MAX_BRICKS_PER_STEP per step, render each cumulative step into a JPEG using
// an offscreen Three.js viewer, and compose a PDF with jsPDF.
//
// Each step page shows:
//   - Step number / total
//   - A 3D render of the cumulative build so far (new bricks highlighted)
//   - A "bricks to add" section listing the new brick(s) by name and color

(function (global) {
  const MAX_BRICKS_PER_STEP = 4;  // keep steps readable
  const PAGE_W_MM = 210;          // A4 portrait
  const PAGE_H_MM = 297;
  const MARGIN_MM = 14;

  function groupSteps(bricks) {
    // Deterministic order: sort by (y ascending, then original index).
    const indexed = bricks.map((b, i) => ({ ...b, _i: i }));
    indexed.sort((a, b) => (a.y - b.y) || (a._i - b._i));

    // Walk through and split per layer into chunks of up to MAX_BRICKS_PER_STEP.
    const steps = [];
    let curY = null;
    let cur = [];
    for (const b of indexed) {
      if (b.y !== curY) {
        if (cur.length) steps.push(cur);
        cur = [];
        curY = b.y;
      }
      cur.push(b);
      if (cur.length >= MAX_BRICKS_PER_STEP) {
        steps.push(cur);
        cur = [];
      }
    }
    if (cur.length) steps.push(cur);
    return steps;
  }

  // Render a single step to a JPEG data URL.
  //
  // We emit JPEG (not PNG) because jsPDF 2.x processes PNG images through a
  // path that internally calls `String.fromCharCode.apply(null, bigArray)` —
  // which blows the call stack on images with many pixels. JPEGs are passed
  // through as raw bytes and are also much smaller, so PDFs stay small.
  //
  // Highlights the bricks in `highlightIds` (new bricks for this step).
  function renderStep(allUpToStep, highlightIds, width = 900, height = 650) {
    const THREE = global.THREE;
    const { BRICK_MAP, STUD, PLATE, buildBrickMesh, placeMesh, footprint } = global.Bricks;

    // Temporary canvas
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height, false);
    renderer.setClearColor(0xf4f5f7); // light bg, good for printing
    renderer.shadowMap.enabled = true;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf4f5f7);

    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 1000);

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(12, 20, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xaacfff, 0.2);
    fill.position.set(-8, 4, -6);
    scene.add(fill);

    // Ground
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.MeshStandardMaterial({ color: 0xe6e8ec, roughness: 1 })
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -0.001;
    plane.receiveShadow = true;
    scene.add(plane);

    // Build all placed bricks
    const group = new THREE.Group();
    scene.add(group);

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, maxY = 0;
    const highlightMeshes = [];
    for (const b of allUpToStep) {
      const brick = BRICK_MAP[b.type];
      if (!brick) continue;
      const mesh = buildBrickMesh(brick, b.color);
      placeMesh(mesh, brick, b.x, b.y, b.z, b.rot || 0);
      mesh.traverse(o => {
        if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
      });

      if (highlightIds.has(b._i ?? b.id)) {
        // Add a glowing outline around highlighted bricks
        const outlineMat = new THREE.MeshBasicMaterial({
          color: 0xffc72c, side: THREE.BackSide, transparent: true, opacity: 0.7,
        });
        mesh.traverse(o => {
          if (o.isMesh && o.geometry) {
            const outline = new THREE.Mesh(o.geometry, outlineMat);
            outline.scale.setScalar(1.08);
            o.add(outline);
          }
        });
        highlightMeshes.push(mesh);
      }
      group.add(mesh);
      const { w, d } = footprint(brick, b.rot || 0);
      minX = Math.min(minX, b.x); maxX = Math.max(maxX, b.x + w);
      minZ = Math.min(minZ, b.z); maxZ = Math.max(maxZ, b.z + d);
      maxY = Math.max(maxY, b.y + brick.h);
    }

    // Center the group
    const cx = ((minX + maxX) / 2) * STUD || 0;
    const cz = ((minZ + maxZ) / 2) * STUD || 0;
    group.position.set(-cx, 0, -cz);

    // Frame camera
    const span = Math.max(maxX - minX, maxZ - minZ, maxY / 3) * STUD || 4;
    const dist = Math.max(6, span * 1.6);
    camera.position.set(dist, dist * 0.85, dist);
    camera.lookAt(0, (maxY * PLATE) / 2 || 0, 0);

    renderer.render(scene, camera);
    // JPEG quality 0.88 is visually indistinguishable from the PNG for brick
    // renders but ~5-10× smaller; critical for jsPDF stability.
    const url = canvas.toDataURL('image/jpeg', 0.88);

    // Cleanup
    renderer.dispose();
    scene.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
        else o.material.dispose();
      }
    });

    return url;
  }

  function brickLabel(b) {
    const def = global.Bricks.BRICK_MAP[b.type];
    const color = global.Bricks.COLOR_MAP[b.color];
    return `${def ? def.name : b.type} · ${color ? color.name : b.color}`;
  }

  async function generatePDF({ name, author, bricks }) {
    if (!global.jspdf) throw new Error('jsPDF not loaded');
    const { jsPDF } = global.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });

    // ---- Cover page ----
    doc.setFillColor(26, 31, 43);
    doc.rect(0, 0, PAGE_W_MM, PAGE_H_MM, 'F');

    doc.setTextColor(255, 199, 44);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(36);
    doc.text('BRICKWORKS', PAGE_W_MM / 2, 60, { align: 'center' });

    doc.setTextColor(232, 236, 241);
    doc.setFontSize(24);
    doc.text(name || 'Untitled', PAGE_W_MM / 2, 100, { align: 'center' });

    doc.setFontSize(14);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(180, 190, 210);
    doc.text(`Designed by ${author || 'anonymous'}`, PAGE_W_MM / 2, 115, { align: 'center' });

    // Render a beauty shot for the cover
    const heroImg = renderStep(bricks.map((b, i) => ({ ...b, _i: i })), new Set(), 900, 650);
    doc.addImage(heroImg, 'JPEG', MARGIN_MM, 130, PAGE_W_MM - MARGIN_MM * 2, 130);

    doc.setFontSize(11);
    doc.setTextColor(152, 162, 179);
    doc.text(`${bricks.length} bricks · generated ${new Date().toLocaleDateString()}`,
      PAGE_W_MM / 2, 275, { align: 'center' });

    // ---- Parts list (second page) ----
    doc.addPage();
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, PAGE_W_MM, PAGE_H_MM, 'F');
    doc.setTextColor(30, 30, 30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text('Parts List', MARGIN_MM, 25);

    // Aggregate parts
    const counts = {};
    for (const b of bricks) {
      const k = `${b.type}::${b.color}`;
      counts[k] = (counts[k] || 0) + 1;
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    let y = 40;
    for (const [k, n] of sorted) {
      if (y > PAGE_H_MM - MARGIN_MM) {
        doc.addPage();
        y = MARGIN_MM + 10;
      }
      const [type, color] = k.split('::');
      const def = global.Bricks.BRICK_MAP[type];
      const col = global.Bricks.COLOR_MAP[color];
      // Swatch
      if (col) {
        const hex = col.hex;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        doc.setFillColor(r, g, b);
        doc.roundedRect(MARGIN_MM, y - 4, 6, 6, 1, 1, 'F');
      }
      doc.setTextColor(30, 30, 30);
      doc.text(`${def ? def.name : type}`, MARGIN_MM + 10, y);
      doc.setTextColor(80, 90, 110);
      doc.text(`${col ? col.name : color}`, MARGIN_MM + 70, y);
      doc.setTextColor(30, 30, 30);
      doc.text(`× ${n}`, PAGE_W_MM - MARGIN_MM, y, { align: 'right' });
      y += 7;
    }

    // ---- Step pages ----
    const steps = groupSteps(bricks);
    let accumulated = [];
    for (let si = 0; si < steps.length; si++) {
      const step = steps[si];
      const newIds = new Set(step.map(s => s._i));
      accumulated = accumulated.concat(step);

      const img = renderStep(accumulated, newIds, 900, 650);

      doc.addPage();
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, PAGE_W_MM, PAGE_H_MM, 'F');

      doc.setTextColor(30, 30, 30);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.text(`Step ${si + 1}`, MARGIN_MM, 22);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.setTextColor(120, 120, 120);
      doc.text(`of ${steps.length}`, MARGIN_MM + 30, 22);

      // image
      const imgW = PAGE_W_MM - MARGIN_MM * 2;
      const imgH = imgW * (650 / 900);
      doc.addImage(img, 'JPEG', MARGIN_MM, 30, imgW, imgH);

      // step list
      doc.setTextColor(30, 30, 30);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      let ly = 30 + imgH + 10;
      doc.text('Add to your build:', MARGIN_MM, ly);
      ly += 7;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      for (const b of step) {
        const col = global.Bricks.COLOR_MAP[b.color];
        if (col) {
          const hex = col.hex;
          const r = parseInt(hex.slice(1, 3), 16);
          const g = parseInt(hex.slice(3, 5), 16);
          const bl = parseInt(hex.slice(5, 7), 16);
          doc.setFillColor(r, g, bl);
          doc.roundedRect(MARGIN_MM, ly - 3.5, 5, 5, 0.5, 0.5, 'F');
        }
        doc.setTextColor(30, 30, 30);
        doc.text(brickLabel(b), MARGIN_MM + 9, ly);
        doc.setTextColor(120, 120, 120);
        doc.text(`layer ${b.y}`, PAGE_W_MM - MARGIN_MM, ly, { align: 'right' });
        ly += 6;
      }

      // footer
      doc.setTextColor(160, 160, 160);
      doc.setFontSize(9);
      doc.text(`${name || 'Untitled'} · Brickworks`, MARGIN_MM, PAGE_H_MM - 8);
      doc.text(`${si + 1} / ${steps.length}`, PAGE_W_MM - MARGIN_MM, PAGE_H_MM - 8, { align: 'right' });

      // Yield to browser so it doesn't freeze
      if (si % 3 === 0) await new Promise(r => setTimeout(r, 0));
    }

    doc.save(`${(name || 'creation').replace(/[^a-z0-9_-]/gi, '_')}.pdf`);
  }

  global.Instructions = { generatePDF, groupSteps, renderStep };
})(window);
