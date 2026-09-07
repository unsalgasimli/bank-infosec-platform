import * as THREE from "three";
import { buildBotanicals } from "./GardenBotanicals.js";
import { buildBird } from "./GardenBird.js";
import { botanicalSurface, craftGrain, detailBatch, tube } from "./GardenCraft.js";

export function buildGarden(scene: THREE.Scene, compact: boolean) {
  const clayGrain = craftGrain("clay");
  const linenGrain = craftGrain("linen");
  const ivory = new THREE.MeshStandardMaterial({
    color: "#f5ead5",
    roughness: 0.83,
    side: THREE.DoubleSide,
    bumpMap: linenGrain,
    bumpScale: 0.009,
  });
  const clay = new THREE.MeshStandardMaterial({
    color: "#bd7355",
    roughness: 0.95,
    bumpMap: clayGrain,
    bumpScale: 0.025,
  });
  const stone = new THREE.MeshStandardMaterial({
    color: "#e5c7a5",
    roughness: 0.94,
    bumpMap: clayGrain,
    bumpScale: 0.012,
  });
  const brass = new THREE.MeshStandardMaterial({
    color: "#9b7a43",
    metalness: 0.82,
    roughness: 0.32,
  });
  const porcelain = new THREE.MeshPhysicalMaterial({ color: "#ece3d0", roughness: 0.48, clearcoat: 0.18, bumpMap: clayGrain, bumpScale: 0.006 });
  const seamMaterial = new THREE.MeshStandardMaterial({ color: "#c5b798", roughness: 0.9 });
  const green = new THREE.MeshStandardMaterial({
    color: "#647d60",
    roughness: 0.85,
    side: THREE.DoubleSide,
  });
  const pink = new THREE.MeshStandardMaterial({
    color: "#e4a083",
    roughness: 0.8,
    side: THREE.DoubleSide,
  });
  const root = new THREE.Group();
  scene.add(root);
  function mesh(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x = 0,
    y = 0,
    z = 0,
    parent: THREE.Object3D = root,
  ) {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  const cylinder = (
    r: number,
    h: number,
    material: THREE.Material,
    x = 0,
    y = 0,
    z = 0,
  ) =>
    mesh(
      new THREE.CylinderGeometry(r, r, h, compact ? 48 : 80),
      material,
      x,
      y,
      z,
    );
  cylinder(3.1, 0.34, stone, 0, 0.18, 0);
  cylinder(2.88, 0.12, porcelain, 0, 0.4, 0);
  // Turned ceramic lips and a shadow reveal give the plinth a manufactured edge.
  cylinder(3.105, 0.045, seamMaterial, 0, 0.065, 0);
  [2.90, 3.08].forEach((r, i) => {
    const lip = mesh(new THREE.TorusGeometry(r, 0.035, 8, compact ? 64 : 128), stone, 0, i ? 0.31 : 0.415, 0);
    lip.rotation.x = Math.PI / 2;
  });
  const floorSeams: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 16; i++) {
    const angle = i * Math.PI / 8;
    floorSeams.push(new THREE.BoxGeometry(0.007, 0.003, 0.98).translate(0, 0.462, 2.19).rotateY(angle));
  }
  detailBatch(root, floorSeams, seamMaterial);
  // The heavy architectural arch makes the miniature legible before anything moves.
  const arch = new THREE.Shape();
  arch.moveTo(-1.8, 0);
  arch.lineTo(-1.8, 2.65);
  arch.absarc(0, 2.65, 1.8, Math.PI, 0, true);
  arch.lineTo(1.8, 0);
  arch.lineTo(1.16, 0);
  arch.lineTo(1.16, 2.65);
  arch.absarc(0, 2.65, 1.16, 0, Math.PI, false);
  arch.lineTo(-1.16, 0);
  arch.closePath();
  const archMesh = mesh(
    new THREE.ExtrudeGeometry(arch, {
      depth: 0.62,
      bevelEnabled: true,
      bevelSegments: compact ? 3 : 5,
      steps: 1,
      bevelSize: 0.055,
      bevelThickness: 0.055,
      curveSegments: compact ? 28 : 48,
    }),
    clay,
    0,
    0.46,
    -1.24,
  );
  // Recessed mouldings follow the entire arch, with radial joints on its crown.
  const archTrim: THREE.BufferGeometry[] = [];
  for (const radius of [1.22, 1.72]) {
    const points = [new THREE.Vector3(-radius, 0.5, -0.557), new THREE.Vector3(-radius, 3.11, -0.557)];
    for (let i = 1; i <= 48; i++) {
      const angle = Math.PI - i * Math.PI / 48;
      points.push(new THREE.Vector3(Math.cos(angle) * radius, 3.11 + Math.sin(angle) * radius, -0.557));
    }
    points.push(new THREE.Vector3(radius, 0.5, -0.557));
    // A polyline avoids spline overshoot at the straight-to-arched junction.
    const path = new THREE.CurvePath<THREE.Vector3>();
    for (let i = 1; i < points.length; i++) path.add(new THREE.LineCurve3(points[i - 1], points[i]));
    archTrim.push(new THREE.TubeGeometry(path, 100, 0.011, 5, false));
  }
  detailBatch(root, archTrim, stone);
  const joints: THREE.BufferGeometry[] = [];
  for (let i = 1; i < 12; i++) {
    const a = i * Math.PI / 12;
    joints.push(new THREE.BoxGeometry(0.49, 0.009, 0.008).rotateZ(a).translate(Math.cos(a) * 1.47, 3.11 + Math.sin(a) * 1.47, -0.552));
  }
  for (const x of [-1.48, 1.48]) {
    for (let i = 1; i < 5; i++) joints.push(new THREE.BoxGeometry(0.48, 0.008, 0.008).translate(x, 0.46 + i * 0.53, -0.552));
    mesh(new THREE.BoxGeometry(0.75, 0.12, 0.8), stone, x, 0.52, -0.93);
  }
  detailBatch(root, joints, seamMaterial);
  const botanicals = buildBotanicals(root, compact);
  // Inlaid concentric brass contours on the porcelain island.
  [2.68, 2.72].forEach((r) => {
    const ring = mesh(
      new THREE.TorusGeometry(r, 0.008, 4, 100),
      brass,
      0,
      0.466,
      0,
    );
    ring.rotation.x = -Math.PI / 2;
  });
  const positions = [
    [-1.8, 1.98, 0.62],
    [0.14, 2.73, 0.18],
    [1.8, 1.6, 0.85],
  ];
  const instruments: THREE.Group[] = [];
  const hitObjects: THREE.Object3D[] = [];
  const targetMarks: THREE.Group[] = [];
  positions.forEach(([x, y, z], index) => {
    cylinder(0.2, 0.18, brass, x, 0.54, z);
    cylinder(0.026, y - 0.55, brass, x, (y + 0.55) / 2, z);
    cylinder(0.235, 0.035, stone, x, 0.465, z);
    cylinder(0.065, 0.13, brass, x, 0.70, z);
    const fittings: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 4; i++) fittings.push(new THREE.CylinderGeometry(0.02, 0.02, 0.015, 6).translate(x + Math.sin(i * Math.PI / 2) * 0.145, 0.639, z + Math.cos(i * Math.PI / 2) * 0.145));
    detailBatch(root, fittings, brass);
    const wheel = new THREE.Group();
    wheel.position.set(x, y, z);
    root.add(wheel);
    instruments.push(wheel);
    const scale = index === 1 ? 1 : 0.73;
    wheel.scale.setScalar(scale);
    // Each blade is a curved, folded physical surface, not a billboard.
    const vertices: number[] = [];
    const uv: number[] = [];
    const indices: number[] = [];
    for (let j = 0; j <= 16; j++) {
      const t = j / 16;
      const radius = 0.08 + t * 1.02;
      const angle = t * 0.9;
      for (let k = 0; k <= 6; k++) {
        const u = k / 6;
        const width = Math.sin(t * Math.PI * 0.85) * 0.72;
        vertices.push(
          Math.sin(angle) * radius + (u - 0.18) * width,
          Math.cos(angle) * radius,
          Math.sin(u * Math.PI) * 0.22 + t * 0.09,
        );
        uv.push(u, t);
        if (j < 16 && k < 6) {
          const n = j * 7 + k;
          indices.push(n, n + 7, n + 1, n + 1, n + 7, n + 8);
        }
      }
    }
    const bladeGeometry = new THREE.BufferGeometry();
    bladeGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    bladeGeometry.setIndex(indices);
    bladeGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    bladeGeometry.computeVertexNormals();
    const stitches: THREE.BufferGeometry[] = [];
    for (let j = 0; j < 5; j++) {
      const blade = mesh(bladeGeometry, ivory, 0, 0, 0, wheel);
      blade.rotation.z = (j * Math.PI * 2) / 5;
      blade.userData.instrument = index;
      hitObjects.push(blade);
      // Raised rolled hems catch the light and reveal the sail construction.
      for (const column of [0, 3, 6]) {
        const points: THREE.Vector3[] = [];
        for (let row = 1; row <= 16; row++) {
          const n = (row * 7 + column) * 3;
          points.push(new THREE.Vector3(vertices[n], vertices[n + 1], vertices[n + 2] + 0.006));
        }
        stitches.push(tube(points, column === 3 ? 0.004 : 0.008, compact ? 12 : 24).rotateZ(j * Math.PI * 2 / 5));
      }
    }
    detailBatch(wheel, stitches, seamMaterial);
    const collar = mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.10, 24), brass, 0, 0, 0.10, wheel);
    collar.rotation.x = Math.PI / 2;
    const center = mesh(
      new THREE.SphereGeometry(0.105, 16, 12),
      brass,
      0,
      0,
      0.12,
      wheel,
    );
    center.userData.instrument = index;
    hitObjects.push(center);
    const screws: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 5; i++) screws.push(new THREE.SphereGeometry(0.014, 6, 4).translate(Math.sin(i * Math.PI * 2 / 5) * 0.12, Math.cos(i * Math.PI * 2 / 5) * 0.12, 0.163));
    detailBatch(wheel, screws, stone);
    // A copper pointer on each instrument turns with it; the fixed target sits behind.
    const needle = mesh(
      new THREE.ConeGeometry(0.06, 0.2, 3),
      clay,
      0,
      1.15,
      0,
      wheel,
    );
    needle.userData.instrument = index;
    hitObjects.push(needle);
    const target = new THREE.Group();
    target.position.set(x, y, z - 0.13);
    target.scale.setScalar(scale);
    root.add(target);
    targetMarks.push(target);
    const rim = mesh(
      new THREE.TorusGeometry(1.19, 0.014, 5, 64),
      brass,
      0,
      0,
      0,
      target,
    );
    rim.castShadow = false;
    const ticks: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 32; i++) ticks.push(new THREE.BoxGeometry(0.009, i % 4 === 0 ? 0.075 : 0.035, 0.012).translate(0, 1.19, 0).rotateZ(i * Math.PI / 16));
    detailBatch(target, ticks, brass);
    mesh(new THREE.SphereGeometry(0.075, 12, 8), green, 0, 1.19, 0, target);
  });
  // A small hanging bell: an intentionally unlabelled discovery.
  const bellPivot = new THREE.Group();
  bellPivot.position.set(0.6, 3.38, -0.9);
  root.add(bellPivot);
  mesh(
    new THREE.CylinderGeometry(0.01, 0.01, 0.5, 6),
    brass,
    0,
    -0.25,
    0,
    bellPivot,
  );
  const bell = mesh(
    new THREE.LatheGeometry([
      new THREE.Vector2(0.02, 0.13), new THREE.Vector2(0.065, 0.115),
      new THREE.Vector2(0.09, 0.065), new THREE.Vector2(0.115, -0.04),
      new THREE.Vector2(0.18, -0.12), new THREE.Vector2(0.195, -0.125),
      new THREE.Vector2(0.18, -0.145), new THREE.Vector2(0.155, -0.115),
      new THREE.Vector2(0.086, 0.035), new THREE.Vector2(0.025, 0.09),
    ], compact ? 24 : 40),
    brass,
    0,
    -0.6,
    0,
    bellPivot,
  );
  bell.userData.discovery = "bell";
  hitObjects.push(bell);
  mesh(new THREE.SphereGeometry(0.033, 12, 8), brass, 0, -0.77, 0, bellPivot);
  mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.15, 6), brass, 0, -0.7, 0, bellPivot);
  const { bird, wings, hits: birdHits } = buildBird(root, compact, brass);
  hitObjects.push(...birdHits);
  // Repeated grass blades share one geometry and one draw call.
  const blade = botanicalSurface(10, 4).scale(0.13, 0.55, 0.6);
  const grass = new THREE.InstancedMesh(blade, green, compact ? 36 : 72);
  const matrix = new THREE.Object3D();
  for (let i = 0; i < grass.count; i++) {
    const cluster = i % 3;
    const angle = i * 2.399;
    const radius = 0.18 + ((i * 17) % 11) / 40;
    matrix.position.set(
      [-2.2, 2.1, -0.8][cluster] + Math.cos(angle) * radius,
      0.48,
      [-0.45, -0.55, -1.95][cluster] + Math.sin(angle) * radius,
    );
    matrix.rotation.set(Math.sin(i) * 0.24, angle, Math.cos(i) * 0.3);
    matrix.scale.setScalar(0.55 + (i % 5) * 0.15);
    matrix.updateMatrix();
    grass.setMatrixAt(i, matrix.matrix);
  }
  grass.castShadow = true;
  root.add(grass);
  const flowers: THREE.Group[] = [];
  const smallPetal = botanicalSurface(compact ? 10 : 16, 6);
  pink.vertexColors = true;
  for (let i = 0; i < 7; i++) {
    const flower = new THREE.Group();
    flower.position.set(
      -2.15 + i * 0.65,
      0.48,
      -0.05 + Math.sin(i * 1.8) * 1.8,
    );
    root.add(flower);
    flowers.push(flower);
    mesh(
      new THREE.CylinderGeometry(0.012, 0.015, 0.56, 5),
      green,
      0,
      0.28,
      0,
      flower,
    );
    for (let j = 0; j < 5; j++) {
      const petal = mesh(
        smallPetal,
        pink,
        0,
        0.59,
        0,
        flower,
      );
      petal.rotation.order = "YXZ";
      petal.rotation.set(1.2, j * Math.PI * 2 / 5, 0);
      petal.scale.set(0.65, 0.28, 0.65);
    }
    const center = mesh(new THREE.SphereGeometry(0.055, 12, 8), brass, 0, 0.61, 0, flower);
    center.scale.y = 0.6;
  }
  const glider = new THREE.Group();
  root.add(glider);
  const paperShape = new THREE.BufferGeometry();
  paperShape.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        0, 0, -0.6, -0.55, 0, 0.35, 0, 0.14, 0.2, 0, 0, -0.6, 0, 0.14, 0.2,
        0.55, 0, 0.35,
      ],
      3,
    ),
  );
  paperShape.computeVertexNormals();
  mesh(paperShape, ivory, 0, 0, 0, glider);
  return {
    root,
    archMesh,
    instruments,
    targetMarks,
    hitObjects,
    bird,
    wings,
    bellPivot,
    flowers,
    glider,
    clay,
    botanicals,
  };
}
