import * as THREE from "three";
import { buildBotanicals } from "./GardenBotanicals.js";

export function buildGarden(scene: THREE.Scene, compact: boolean) {
  const ivory = new THREE.MeshStandardMaterial({
    color: "#f5ead5",
    roughness: 0.83,
    side: THREE.DoubleSide,
  });
  const clay = new THREE.MeshStandardMaterial({
    color: "#bd7355",
    roughness: 0.95,
  });
  const stone = new THREE.MeshStandardMaterial({
    color: "#e5c7a5",
    roughness: 0.94,
  });
  const brass = new THREE.MeshStandardMaterial({
    color: "#9b7a43",
    metalness: 0.55,
    roughness: 0.43,
  });
  const green = new THREE.MeshStandardMaterial({
    color: "#647d60",
    roughness: 0.85,
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
  cylinder(2.88, 0.12, ivory, 0, 0.4, 0);
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
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.035,
      bevelThickness: 0.035,
      curveSegments: compact ? 28 : 48,
    }),
    clay,
    0,
    0.46,
    -1.24,
  );
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
    const wheel = new THREE.Group();
    wheel.position.set(x, y, z);
    root.add(wheel);
    instruments.push(wheel);
    const scale = index === 1 ? 1 : 0.73;
    wheel.scale.setScalar(scale);
    // Each blade is a curved, folded physical surface, not a billboard.
    const vertices: number[] = [];
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
    bladeGeometry.computeVertexNormals();
    for (let j = 0; j < 5; j++) {
      const blade = mesh(bladeGeometry, ivory, 0, 0, 0, wheel);
      blade.rotation.z = (j * Math.PI * 2) / 5;
      blade.userData.instrument = index;
      hitObjects.push(blade);
    }
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
    new THREE.CylinderGeometry(0.09, 0.19, 0.24, 20, 1, true),
    brass,
    0,
    -0.6,
    0,
    bellPivot,
  );
  bell.userData.discovery = "bell";
  hitObjects.push(bell);
  // Quiet inhabitant, made from folded paper triangles.
  const bird = new THREE.Group();
  bird.position.set(-1.0, 0.63, 2);
  bird.rotation.y = Math.PI + 0.18;
  bird.scale.setScalar(1.35);
  root.add(bird);
  const body = mesh(
    new THREE.ConeGeometry(0.13, 0.4, 4),
    ivory,
    0,
    0.1,
    0,
    bird,
  );
  body.rotation.x = Math.PI / 2;
  body.userData.discovery = "bird";
  hitObjects.push(body);
  const head = mesh(
    new THREE.SphereGeometry(0.075, 8, 6),
    ivory,
    0,
    0.24,
    -0.16,
    bird,
  );
  head.userData.discovery = "bird";
  hitObjects.push(head);
  const eyeMaterial = new THREE.MeshStandardMaterial({
    color: "#353f36",
    roughness: 0.7,
  });
  [-1, 1].forEach((side) =>
    mesh(
      new THREE.SphereGeometry(0.012, 8, 6),
      eyeMaterial,
      side * 0.055,
      0.26,
      -0.202,
      bird,
    ),
  );
  const beak = mesh(
    new THREE.ConeGeometry(0.034, 0.14, 4),
    brass,
    0,
    0.24,
    -0.25,
    bird,
  );
  beak.rotation.x = -Math.PI / 2;
  const wings: THREE.Mesh[] = [];
  [-1, 1].forEach((side) => {
    const wing = mesh(
      new THREE.ConeGeometry(0.14, 0.36, 3),
      ivory,
      side * 0.13,
      0.15,
      0.015,
      bird,
    );
    wing.rotation.z = side * 0.8;
    wings.push(wing);
  });
  // Repeated grass blades share one geometry and one draw call.
  const blade = new THREE.ConeGeometry(0.055, 0.55, 3);
  const grass = new THREE.InstancedMesh(blade, green, compact ? 36 : 72);
  const matrix = new THREE.Object3D();
  for (let i = 0; i < grass.count; i++) {
    const cluster = i % 3;
    const angle = i * 2.399;
    const radius = 0.18 + ((i * 17) % 11) / 40;
    matrix.position.set(
      [-2.2, 2.1, -0.8][cluster] + Math.cos(angle) * radius,
      0.68,
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
        new THREE.SphereGeometry(0.13, 8, 6),
        pink,
        Math.cos(j * 1.256) * 0.13,
        0.59,
        Math.sin(j * 1.256) * 0.13,
        flower,
      );
      petal.scale.y = 0.35;
    }
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
