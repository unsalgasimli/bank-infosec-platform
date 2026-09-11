import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { EXPRESSBANK_EMBLEM_PATH } from "../../common/ExpressbankLogo.js";
import type { BirdFlight } from "./garden-bird-game.js";
import type { Daylight } from "./day-cycle.js";

export interface FlightSceneController {
  update: (flight: BirdFlight, daylight?: Daylight) => void;
  resize: (width: number, height: number) => void;
  dispose: () => void;
}

/**
 * Creates the refined high-fidelity 3D scene for Expressbank Flight:
 * - Official Expressbank golden 3D emblem with bevelled metallic lacquer, core glow, and aerodynamic banking
 * - Elegant architectural torii archways with curved kasagi eaves, brass end-caps, glowing passage lanterns, and cascading wisteria
 * - Sculpted cloud-pruned hedges over tiered zen granite plinths
 * - Smooth rolling multi-layered mountain silhouettes (no low-poly pyramid spikes)
 * - Dynamic reflective water with drifting lilies and tumbling sakura blossom petals
 * - Luminous trailing energy streamer particles behind the emblem
 */
export function createFlight3DScene(
  container: HTMLElement,
  daylight?: Daylight,
): FlightSceneController {
  const width = container.clientWidth || 800;
  const height = container.clientHeight || 460;

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.domElement.setAttribute("aria-hidden", "true");
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();

  // Perspective camera with wide cinematic FOV
  const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 45);
  camera.position.set(0, 0, 8.8);
  camera.lookAt(0, 0, 0);

  // Lighting tuned for metallic lacquer reflections and atmospheric depth
  const hemiLight = new THREE.HemisphereLight("#fff9e8", "#384d43", 2.0);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight("#fff4dc", 2.5);
  sunLight.position.set(4, 6, 6);
  scene.add(sunLight);

  const rimLight = new THREE.DirectionalLight("#ffd796", 1.2);
  rimLight.position.set(-6, -2, -3);
  scene.add(rimLight);

  const ambientGlow = new THREE.AmbientLight("#dcebe3", 1.0);
  scene.add(ambientGlow);

  // Shared High-Finish Materials
  const goldBrassMat = new THREE.MeshStandardMaterial({
    color: "#e6b03b",
    roughness: 0.18,
    metalness: 0.88,
  });

  const vermilionLacquerMat = new THREE.MeshPhysicalMaterial({
    color: "#b83824",
    roughness: 0.28,
    clearcoat: 0.85,
    clearcoatRoughness: 0.15,
    metalness: 0.06,
  });

  const roofSlateMat = new THREE.MeshStandardMaterial({
    color: "#25302b",
    roughness: 0.48,
    metalness: 0.15,
  });

  const stonePlinthMat = new THREE.MeshStandardMaterial({
    color: "#46554e",
    roughness: 0.68,
    metalness: 0.08,
  });

  const graniteWallMat = new THREE.MeshStandardMaterial({
    color: "#8e9188",
    roughness: 0.82,
  });

  const hedgeMat = new THREE.MeshStandardMaterial({
    color: "#3a5f45",
    roughness: 0.78,
  });

  const hedgeDeepMat = new THREE.MeshStandardMaterial({
    color: "#284431",
    roughness: 0.85,
  });

  const wisteriaPrimaryMat = new THREE.MeshStandardMaterial({
    color: "#baa8e2",
    roughness: 0.52,
    transparent: true,
    opacity: 0.94,
  });

  const wisteriaAccentMat = new THREE.MeshStandardMaterial({
    color: "#dfd6f5",
    roughness: 0.48,
    transparent: true,
    opacity: 0.96,
  });

  const trellisWoodMat = new THREE.MeshStandardMaterial({
    color: "#534335",
    roughness: 0.65,
  });

  const lanternGlowMat = new THREE.MeshStandardMaterial({
    color: "#ffaa33",
    emissive: "#ff8c00",
    emissiveIntensity: 1.5,
    roughness: 0.25,
  });

  // -------------------------------------------------------------
  // 1. DYNAMIC SKY & ATMOSPHERIC BACKDROP
  // -------------------------------------------------------------
  const skyGeo = new THREE.PlaneGeometry(38, 22);
  const skyCanvas = document.createElement("canvas");
  skyCanvas.width = 16;
  skyCanvas.height = 128;
  const skyCtx = skyCanvas.getContext("2d")!;
  const skyTexture = new THREE.CanvasTexture(skyCanvas);

  function updateSkyGradient(dl?: Daylight) {
    const period = dl?.period ?? "day";
    const gradient = skyCtx.createLinearGradient(0, 0, 0, 128);

    if (period === "night") {
      gradient.addColorStop(0, "#0a1116");
      gradient.addColorStop(0.55, "#121f25");
      gradient.addColorStop(1, "#1c2e30");
    } else if (period === "golden-hour" || period === "dusk") {
      gradient.addColorStop(0, "#834937");
      gradient.addColorStop(0.45, "#c7704e");
      gradient.addColorStop(0.8, "#dfa46e");
      gradient.addColorStop(1, "#c19e76");
    } else if (period === "dawn" || period === "blue-hour") {
      gradient.addColorStop(0, "#253342");
      gradient.addColorStop(0.5, "#565264");
      gradient.addColorStop(1, "#ac9387");
    } else {
      gradient.addColorStop(0, "#95baa9");
      gradient.addColorStop(0.38, "#b6d1c7");
      gradient.addColorStop(0.8, "#d7e7df");
      gradient.addColorStop(1, "#edf4ef");
    }

    skyCtx.fillStyle = gradient;
    skyCtx.fillRect(0, 0, 16, 128);
    skyTexture.needsUpdate = true;
  }
  updateSkyGradient(daylight);

  const skyMesh = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ map: skyTexture, depthWrite: false }));
  skyMesh.position.set(0, 0, -11);
  scene.add(skyMesh);

  // Smooth Multi-layered Parallax Mountain Ridges (24 segments for organic rolling contours)
  const farMountainGroup = new THREE.Group();
  farMountainGroup.position.set(0.6, -0.1, -9.5);
  const farMountainMat = new THREE.MeshBasicMaterial({ color: "#9dbdb0", transparent: true, opacity: 0.32 });
  for (let i = -4; i <= 4; i++) {
    const mHeight = 3.4 + Math.sin(i * 1.35 + 0.5) * 1.2;
    const mRadius = 2.4 + (Math.abs(i) % 2) * 0.8;
    const mGeo = new THREE.ConeGeometry(mRadius, mHeight, 24);
    const mMesh = new THREE.Mesh(mGeo, farMountainMat);
    mMesh.position.set(i * 3.8, -1.1 + mHeight * 0.5, 0);
    farMountainGroup.add(mMesh);
  }
  scene.add(farMountainGroup);

  const midMountainGroup = new THREE.Group();
  midMountainGroup.position.set(0, -0.5, -7.2);
  const midMountainMat = new THREE.MeshBasicMaterial({ color: "#6a8d80", transparent: true, opacity: 0.52 });
  for (let i = -4; i <= 4; i++) {
    const mHeight = 2.6 + Math.sin(i * 1.6 + 1.2) * 0.9;
    const mRadius = 3.2 + (i % 2) * 1.0;
    const mGeo = new THREE.ConeGeometry(mRadius * 0.55, mHeight, 24);
    const mMesh = new THREE.Mesh(mGeo, midMountainMat);
    mMesh.position.set(i * 2.9, -1.1 + mHeight * 0.5, 0);
    midMountainGroup.add(mMesh);
  }
  scene.add(midMountainGroup);

  // Reflective Koi Water Surface
  const rippleCanvas = document.createElement("canvas");
  rippleCanvas.width = rippleCanvas.height = 256;
  const rippleCtx = rippleCanvas.getContext("2d")!;
  rippleCtx.fillStyle = "#808080";
  rippleCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 110; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const r = 6 + Math.random() * 20;
    const shade = 120 + Math.floor(Math.random() * 26);
    const blob = rippleCtx.createRadialGradient(x, y, 0, x, y, r);
    blob.addColorStop(0, `rgb(${shade},${shade},${shade})`);
    blob.addColorStop(1, "rgba(128,128,128,0)");
    rippleCtx.fillStyle = blob;
    rippleCtx.beginPath();
    rippleCtx.arc(x, y, r, 0, Math.PI * 2);
    rippleCtx.fill();
  }
  const rippleTexture = new THREE.CanvasTexture(rippleCanvas);
  rippleTexture.wrapS = rippleTexture.wrapT = THREE.RepeatWrapping;
  rippleTexture.repeat.set(4, 1.5);

  const waterGeo = new THREE.PlaneGeometry(34, 12);
  const waterMat = new THREE.MeshStandardMaterial({
    color: "#284b41",
    roughness: 0.16,
    metalness: 0.52,
    transparent: true,
    opacity: 0.93,
    bumpMap: rippleTexture,
    bumpScale: 0.35,
  });
  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.rotation.x = -Math.PI / 2;
  waterMesh.position.set(0, -2.55, 0);
  scene.add(waterMesh);

  // Sculpted Water Lily Pads with Notch
  const lilyPads: THREE.Group[] = [];
  const lilyMat = new THREE.MeshStandardMaterial({ color: "#366147", roughness: 0.55 });
  const lotusFlowerMat = new THREE.MeshStandardMaterial({ color: "#f8d8e8", roughness: 0.4 });
  const lotusCenterMat = new THREE.MeshStandardMaterial({ color: "#ffc107", roughness: 0.3 });

  for (let i = 0; i < 7; i++) {
    const lilyGroup = new THREE.Group();
    const padRadius = 0.24 + (i % 3) * 0.07;
    // Cylinder with missing wedge (notch)
    const padGeo = new THREE.CylinderGeometry(padRadius, padRadius, 0.02, 20, 1, false, 0, Math.PI * 1.82);
    const pad = new THREE.Mesh(padGeo, lilyMat);
    lilyGroup.add(pad);

    if (i % 2 === 0) {
      // Delicate floating lotus flower
      const flower = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.07, 7), lotusFlowerMat);
      flower.position.set(0.04, 0.04, 0.04);
      flower.rotation.x = Math.PI;
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), lotusCenterMat);
      core.position.set(0.04, 0.05, 0.04);
      lilyGroup.add(flower, core);
    }

    lilyGroup.position.set(-6 + i * 2.0 + Math.random() * 0.4, -2.54, (Math.random() - 0.5) * 2.4);
    lilyGroup.rotation.y = Math.random() * Math.PI * 2;
    scene.add(lilyGroup);
    lilyPads.push(lilyGroup);
  }

  // Drifting Sakura Petals
  const petalCount = 36;
  const petalGeo = new THREE.PlaneGeometry(0.13, 0.19);
  petalGeo.translate(0, 0.095, 0);
  const petalMat = new THREE.MeshStandardMaterial({
    color: "#fde3de",
    roughness: 0.38,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.88,
  });
  const petals: { mesh: THREE.Mesh; speed: number; rotSpeed: number; swayPhase: number }[] = [];
  for (let i = 0; i < petalCount; i++) {
    const mesh = new THREE.Mesh(petalGeo, petalMat);
    mesh.position.set(
      (Math.random() - 0.5) * 18,
      -2.2 + Math.random() * 5.4,
      (Math.random() - 0.5) * 4.6,
    );
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    scene.add(mesh);
    petals.push({
      mesh,
      speed: 1.1 + Math.random() * 1.7,
      rotSpeed: 1.4 + Math.random() * 2.4,
      swayPhase: Math.random() * Math.PI * 2,
    });
  }

  // -------------------------------------------------------------
  // 2. OFFICIAL EXPRESSBANK 3D EMBLEM & DYNAMIC FLIGHT AURA
  // -------------------------------------------------------------
  const emblemGroup = new THREE.Group();
  emblemGroup.position.set(-2.2, 0.15, 0);
  scene.add(emblemGroup);

  const emblemMat = new THREE.MeshPhysicalMaterial({
    color: "#FAA61A",
    metalness: 0.44,
    roughness: 0.2,
    clearcoat: 1.0,
    clearcoatRoughness: 0.12,
    emissive: "#D97706",
    emissiveIntensity: 0.42,
    reflectivity: 0.92,
  });

  // Build authentic 3D Expressbank emblem from official vector path
  let emblemMesh: THREE.Mesh;
  try {
    const loader = new SVGLoader();
    const svgMarkup = `<svg viewBox="0 0 40 30"><path fill-rule="evenodd" clip-rule="evenodd" d="${EXPRESSBANK_EMBLEM_PATH}"/></svg>`;
    const parsed = loader.parse(svgMarkup);
    const shapes = SVGLoader.createShapes(parsed.paths[0]);

    const emblemGeo = new THREE.ExtrudeGeometry(shapes, {
      depth: 2.2,
      bevelEnabled: true,
      bevelSegments: 5,
      bevelThickness: 0.55,
      bevelSize: 0.4,
      curveSegments: 36,
    });
    emblemGeo.center();
    // Invert Y to match Three.js world coordinates and scale to flight bounds
    emblemGeo.scale(0.0165, -0.0165, 0.0165);
    emblemGeo.computeVertexNormals();
    emblemMesh = new THREE.Mesh(emblemGeo, emblemMat);
  } catch {
    // Elegant fallback torus if SVG loader is unavailable
    const fallbackGeo = new THREE.TorusGeometry(0.24, 0.08, 16, 32);
    emblemMesh = new THREE.Mesh(fallbackGeo, emblemMat);
  }
  emblemGroup.add(emblemMesh);

  // Warm radiant core light that illuminates gates as the emblem passes
  const emblemLight = new THREE.PointLight("#FFA000", 2.0, 3.8);
  emblemLight.position.set(0, 0, 0.1);
  emblemGroup.add(emblemLight);

  // Aerodynamic golden particle streamer (trail)
  const trailCount = 20;
  const trailGeo = new THREE.SphereGeometry(0.038, 8, 6);
  const trailMat = new THREE.MeshBasicMaterial({
    color: "#FFD54F",
    transparent: true,
    opacity: 0.6,
  });
  const trailParticles: { mesh: THREE.Mesh; age: number; offset: THREE.Vector3 }[] = [];
  const trailGroup = new THREE.Group();
  scene.add(trailGroup);

  for (let i = 0; i < trailCount; i++) {
    const pMesh = new THREE.Mesh(trailGeo, trailMat.clone());
    pMesh.visible = false;
    trailGroup.add(pMesh);
    trailParticles.push({
      mesh: pMesh,
      age: i / trailCount,
      offset: new THREE.Vector3(),
    });
  }

  // -------------------------------------------------------------
  // 3. ARCHITECTURAL TORII GATES WITH WISTERIA & GLOWING LANTERNS
  // -------------------------------------------------------------
  interface Gate3D {
    group: THREE.Group;
    topGroup: THREE.Group;
    bottomGroup: THREE.Group;
    lantern: THREE.Group;
    lanternLight: THREE.PointLight;
    vines: THREE.Group;
  }

  const gates: Gate3D[] = [];
  const blossomGeo = new THREE.SphereGeometry(0.075, 8, 6);
  const cordGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 6);
  const dummy = new THREE.Object3D();

  // Reusable curved kasagi eave geometry
  function createCurvedKasagiGeo(): THREE.BufferGeometry {
    const shape = new THREE.Shape();
    // Elegant upward swept roof profile
    shape.moveTo(-0.95, 0.0);
    shape.quadraticCurveTo(0, -0.04, 0.95, 0.0);
    shape.lineTo(0.98, 0.16);
    shape.quadraticCurveTo(0, 0.11, -0.98, 0.16);
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.85,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.03,
      bevelSegments: 4,
    });
    geo.center();
    return geo;
  }
  const curvedKasagiGeo = createCurvedKasagiGeo();

  for (let g = 0; g < 3; g++) {
    const gateGroup = new THREE.Group();
    scene.add(gateGroup);

    // ---- TOP ASSEMBLY (local y = 0 is the passage ceiling) -------
    const topGroup = new THREE.Group();
    gateGroup.add(topGroup);

    // Nuki tie beam capping the passage mouth
    const nuki = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.11, 0.62), vermilionLacquerMat);
    nuki.position.y = 0.055;
    topGroup.add(nuki);

    // Central Gakuzuka crest tablet
    const gakuzuka = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 0.38), roofSlateMat);
    gakuzuka.position.y = 0.19;

    // Golden Expressbank crest pill on the tablet
    const miniCrest = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.40), goldBrassMat);
    miniCrest.position.y = 0.19;

    // Shimaki lintel
    const shimaki = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.12, 0.72), vermilionLacquerMat);
    shimaki.position.y = 0.31;

    // Curved sweeping Kasagi roof
    const kasagi = new THREE.Mesh(curvedKasagiGeo, roofSlateMat);
    kasagi.position.y = 0.45;

    // Polished brass end caps on sweeping eaves
    const capL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.88), goldBrassMat);
    capL.position.set(-0.92, 0.46, 0);
    const capR = capL.clone();
    capR.position.x = 0.92;

    topGroup.add(gakuzuka, miniCrest, shimaki, kasagi, capL, capR);

    // Slender bamboo trellis frame rising from the lintel
    const trellisPostGeo = new THREE.CylinderGeometry(0.028, 0.028, 4.2, 8);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(trellisPostGeo, trellisWoodMat);
      post.position.set(side * 0.58, 2.55, 0);
      topGroup.add(post);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.06, 0.08), trellisWoodMat);
    lintel.position.y = 4.45;
    const rail = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.05, 0.06), trellisWoodMat);
    rail.position.y = 2.75;
    topGroup.add(lintel, rail);

    // Hanging Wisteria Cascades
    const vines = new THREE.Group();
    vines.position.y = 4.4;
    topGroup.add(vines);

    const strandXs = [-0.32, -0.12, 0.12, 0.32];
    const strandLengths = [3.6, 2.9, 3.2, 3.5];
    strandXs.forEach((x, i) => {
      const cord = new THREE.Mesh(cordGeo, trellisWoodMat);
      cord.scale.y = strandLengths[i];
      cord.position.set(x, -strandLengths[i] / 2, 0);
      vines.add(cord);
    });

    // Instanced Wisteria floral pendants
    const blossoms = new THREE.InstancedMesh(blossomGeo, wisteriaPrimaryMat, 32);
    let placed = 0;
    for (let s = 0; s < strandXs.length && placed < 32; s++) {
      const x = strandXs[s];
      const len = strandLengths[s];
      const count = 8;
      for (let b = 0; b < count && placed < 32; b++) {
        const t = b / count;
        dummy.position.set(
          x + (Math.random() - 0.5) * 0.18,
          -t * len - 0.08,
          (Math.random() - 0.5) * 0.25,
        );
        const scale = 1.2 - t * 0.3 + Math.random() * 0.2;
        dummy.scale.setScalar(scale);
        dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
        dummy.updateMatrix();
        blossoms.setMatrixAt(placed++, dummy.matrix);
      }
    }
    blossoms.instanceMatrix.needsUpdate = true;
    blossoms.frustumCulled = false;
    vines.add(blossoms);

    // Passage Center Glowing Garden Lantern (visual beacon)
    const lanternGroup = new THREE.Group();
    lanternGroup.position.set(0, -0.04, 0);

    const lanternCap = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.08, 6), goldBrassMat);
    lanternCap.position.y = 0.14;

    const lanternBody = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.22, 6), lanternGlowMat);
    lanternBody.position.y = 0.0;

    const lanternBottomCap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.07, 0.05, 6), goldBrassMat);
    lanternBottomCap.position.y = -0.13;

    const lanternCord = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.12, 5), goldBrassMat);
    lanternCord.position.y = 0.22;

    const lanternLight = new THREE.PointLight("#FFA000", 1.4, 2.6);
    lanternLight.position.set(0, 0, 0);

    lanternGroup.add(lanternCap, lanternBody, lanternBottomCap, lanternCord, lanternLight);
    topGroup.add(lanternGroup);

    // ---- BOTTOM ASSEMBLY (local y = 0 is the passage floor) -----
    const bottomGroup = new THREE.Group();
    gateGroup.add(bottomGroup);

    // Polished Granite Capital Collar
    const graniteCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.74, 0.14, 20), graniteWallMat);
    graniteCollar.position.y = -0.07;
    bottomGroup.add(graniteCollar);

    // Cloud-pruned Sculpted Bonsai Hedge (smooth 20 segments)
    const hedgeSpecs: [number, number, number, THREE.Material][] = [
      [-0.32, -0.20, 0.04, hedgeMat],
      [0.0, -0.14, 0.12, hedgeDeepMat],
      [0.34, -0.22, -0.04, hedgeMat],
    ];
    for (const [x, y, z, mat] of hedgeSpecs) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 12), mat);
      puff.position.set(x, y, z);
      puff.scale.set(1.4, 0.65, 1.05);
      bottomGroup.add(puff);
    }

    // Red camellia floral accent on the moss
    const camellia = new THREE.Mesh(new THREE.IcosahedronGeometry(0.075, 1), vermilionLacquerMat);
    camellia.position.set(-0.36, -0.08, 0.18);
    bottomGroup.add(camellia);

    // Tiered Zen Granite Plinth with Chamfered Steps
    const tierHeights = [0.38, 0.42, 0.46, 0.52];
    const tierWidths = [1.05, 1.18, 1.32, 1.46];
    let curY = -0.32;
    tierHeights.forEach((h, idx) => {
      curY -= h * 0.5;
      const step = new THREE.Mesh(
        new THREE.BoxGeometry(tierWidths[idx], h, 0.72 + idx * 0.08),
        idx % 2 === 0 ? graniteWallMat : stonePlinthMat,
      );
      step.position.set(0, curY, 0);
      bottomGroup.add(step);
      curY -= h * 0.5;
    });

    gates.push({
      group: gateGroup,
      topGroup,
      bottomGroup,
      lantern: lanternGroup,
      lanternLight,
      vines,
    });
  }

  // Animation Loop State
  let animTime = 0;
  let trailIndex = 0;

  function update(flight: BirdFlight, dl?: Daylight) {
    if (dl) updateSkyGradient(dl);

    animTime += 0.02;

    // 1. Smooth Aerodynamic Banking & Maneuvering
    emblemGroup.position.y = flight.y;

    if (flight.status === "flying") {
      // Dynamic pitch: lifts nose smoothly when climbing, levels when gliding
      const targetPitch = flight.pitch;
      emblemGroup.rotation.z = targetPitch;

      // Subtle roll & yaw into the flight velocity
      const flapRoll = Math.sin(flight.wingPhase * Math.PI) * 0.28;
      emblemGroup.rotation.x = flapRoll;
      emblemGroup.rotation.y = Math.sin(animTime * 1.8) * 0.08;

      // Dynamic trail streamer emissions
      if (Math.sin(animTime * 6) > 0) {
        const p = trailParticles[trailIndex % trailCount];
        trailIndex++;
        p.mesh.position.set(
          emblemGroup.position.x - 0.28,
          emblemGroup.position.y + (Math.random() - 0.5) * 0.06,
          (Math.random() - 0.5) * 0.1,
        );
        p.mesh.visible = true;
        p.age = 1.0;
      }
    } else if (flight.status === "ready") {
      // Gentle floating idle breathing bob
      emblemGroup.rotation.z = Math.sin(animTime * 2.0) * 0.04;
      emblemGroup.rotation.x = Math.sin(animTime * 1.6) * 0.06;
      emblemGroup.rotation.y = Math.sin(animTime * 1.1) * 0.12;
    } else {
      // Soft landing settle
      emblemGroup.rotation.z = -0.18;
      emblemGroup.rotation.x = -0.22;
      emblemGroup.rotation.y = 0.18;
    }

    // Update trail particles
    for (const p of trailParticles) {
      if (p.mesh.visible) {
        p.age -= 0.035;
        p.mesh.position.x -= 0.045;
        p.mesh.scale.setScalar(Math.max(0.1, p.age * 0.9));
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, p.age * 0.7);
        if (p.age <= 0) p.mesh.visible = false;
      }
    }

    // 2. Update Gates, Archways & Lantern Sways
    flight.gates.forEach((gate, idx) => {
      const g = gates[idx];
      if (!g) return;

      g.group.position.x = gate.x;

      const topY = gate.gapY + gate.gapHeight * 0.5;
      const bottomY = gate.gapY - gate.gapHeight * 0.5;

      g.topGroup.position.y = topY;
      g.bottomGroup.position.y = bottomY;

      // Gentle lantern sway in the breeze + soft rhythmic glow pulse
      g.lantern.rotation.z = Math.sin(animTime * 2.8 + gate.id) * 0.12;
      g.lanternLight.intensity = 1.3 + Math.sin(animTime * 3.5 + gate.id) * 0.35;

      // Wisteria floral cascade sways organically with wind
      g.vines.rotation.z = Math.sin(animTime * 1.3 + gate.id * 1.5) * 0.032;
      g.vines.rotation.x = Math.cos(animTime * 1.0 + gate.id) * 0.02;
    });

    // 3. Drifting Sakura Blossom Petals
    for (const petal of petals) {
      petal.mesh.position.x -= petal.speed * 0.016;
      petal.mesh.position.y += Math.sin(animTime * 2.2 + petal.swayPhase) * 0.008 - 0.003;
      petal.mesh.rotation.x += petal.rotSpeed * 0.012;
      petal.mesh.rotation.y += petal.rotSpeed * 0.015;

      if (petal.mesh.position.x < -8.5) {
        petal.mesh.position.x = 8.5 + Math.random() * 2;
        petal.mesh.position.y = -2.2 + Math.random() * 5.2;
      }
    }

    // 4. Parallax Mountain Ridges Drift
    midMountainGroup.position.x = -((animTime * 0.11) % 2.9);
    farMountainGroup.position.x = -((animTime * 0.045) % 3.8);

    // 5. Water Reflections & Lily Floating
    rippleTexture.offset.x = (animTime * 0.016) % 1;
    rippleTexture.offset.y = Math.sin(animTime * 0.05) * 0.02;
    for (let i = 0; i < lilyPads.length; i++) {
      const pad = lilyPads[i];
      pad.position.x -= 0.0055;
      pad.position.y = -2.54 + Math.sin(animTime * 1.8 + i) * 0.012;
      if (pad.position.x < -7.5) pad.position.x = 7.5;
    }

    renderer.render(scene, camera);
  }

  function resize(newWidth: number, newHeight: number) {
    if (newWidth <= 0 || newHeight <= 0) return;
    renderer.setSize(newWidth, newHeight);
    camera.aspect = newWidth / newHeight;
    camera.updateProjectionMatrix();
  }

  function dispose() {
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        if (Array.isArray(object.material)) {
          object.material.forEach((m) => m.dispose());
        } else {
          object.material.dispose();
        }
      }
    });
    curvedKasagiGeo.dispose();
    rippleTexture.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  }

  return { update, resize, dispose };
}
