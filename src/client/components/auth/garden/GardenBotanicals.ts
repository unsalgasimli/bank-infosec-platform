import * as THREE from "three";
import { botanicalSurface, detailBatch, tube } from "./GardenCraft.js";

/** Shared curved leaf surfaces, instanced across the planted pockets. */
export function buildBotanicals(parent: THREE.Group, compact: boolean) {
  const leafGeometry = botanicalSurface(compact ? 14 : 24, compact ? 6 : 10);
  const leafMaterial = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.62,
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  const leaves = new THREE.InstancedMesh(
    leafGeometry,
    leafMaterial,
    compact ? 48 : 84,
  );
  const transform = new THREE.Object3D();
  const pockets = [
    [-2.25, 0.1],
    [2.17, -0.28],
    [-1.55, -1.7],
    [0.95, -2],
    [-1.7, 1.66],
    [1.7, 1.75],
  ];
  const tones = ["#426650", "#6e8e69", "#91a275", "#557b65"];
  const stems: THREE.BufferGeometry[] = [];
  for (let i = 0; i < leaves.count; i++) {
    const [x, z] = pockets[i % pockets.length];
    const angle = i * 2.39996;
    transform.position.set(
      x + Math.cos(angle) * 0.19,
      0.49 + (i % 3) * 0.055,
      z + Math.sin(angle) * 0.19,
    );
    transform.rotation.set(
      0.25 + (i % 5) * 0.12,
      angle,
      Math.sin(angle) * 0.45,
    );
    transform.scale.set(0.8 + (i % 3) * 0.16, 0.43 + (i % 7) * 0.095, 1);
    transform.updateMatrix();
    leaves.setMatrixAt(i, transform.matrix);
    leaves.setColorAt(i, new THREE.Color(tones[i % tones.length]));
    if (i % 2 === 0) stems.push(tube([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.18, 0.035), new THREE.Vector3(0, 0.52, 0.155),
    ], 0.009, 8).applyMatrix4(transform.matrix));
  }
  leaves.castShadow = true;
  leaves.receiveShadow = true;
  parent.add(leaves);
  const stemMaterial = new THREE.MeshStandardMaterial({ color: "#8b9d67", roughness: 0.8 });
  detailBatch(parent, stems, stemMaterial);
  // Dark planted pockets and river stones ground the foliage in the porcelain.
  const soil = new THREE.MeshStandardMaterial({ color: "#656650", roughness: 1 });
  const beds: THREE.BufferGeometry[] = [], pebbles: THREE.BufferGeometry[] = [];
  pockets.forEach(([x, z], index) => {
    beds.push(new THREE.SphereGeometry(1, 16, 8).scale(0.38, 0.055, 0.29).translate(x, 0.465, z));
    for (let i = 0; i < 7; i++) {
      const a = i * 2.399 + index;
      pebbles.push(new THREE.SphereGeometry(1, compact ? 6 : 10, 6).scale(0.075 + (i % 3) * 0.017, 0.04, 0.065).rotateY(a).translate(x + Math.cos(a) * 0.33, 0.49, z + Math.sin(a) * 0.24));
    }
  });
  detailBatch(parent, beds, soil);
  detailBatch(parent, pebbles, new THREE.MeshStandardMaterial({ color: "#b5b19a", roughness: 0.82 }));

  // Broad floating lily leaves give the water a living edge.
  const lilyMaterial = new THREE.MeshStandardMaterial({
    color: "#769778",
    roughness: 0.72,
    side: THREE.DoubleSide,
  });
  const lilyGeometry = new THREE.CircleGeometry(
    0.34,
    compact ? 32 : 64,
    0.15,
    Math.PI * 2 - 0.3,
  );
  const lilyPositions = lilyGeometry.getAttribute("position");
  for (let i = 0; i < lilyPositions.count; i++) {
    const r = Math.hypot(lilyPositions.getX(i), lilyPositions.getY(i)) / 0.34;
    lilyPositions.setZ(i, r * r * 0.023);
  }
  lilyGeometry.computeVertexNormals();
  const lilyVeins: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const leaf = new THREE.Mesh(lilyGeometry, lilyMaterial);
    const angle = 0.6 + i * 0.77;
    leaf.position.set(
      Math.sin(angle) * (3.5 + (i % 2) * 0.35),
      -0.025,
      Math.cos(angle) * (3.5 + (i % 2) * 0.35),
    );
    leaf.rotation.set(-Math.PI / 2, 0, angle);
    leaf.scale.setScalar(0.6 + (i % 3) * 0.2);
    parent.add(leaf);
    leaf.updateMatrix();
    for (let j = 0; j < 9; j++) {
      const a = 0.22 + j * (Math.PI * 2 - 0.44) / 8;
      lilyVeins.push(tube([new THREE.Vector3(0, 0, 0.002), new THREE.Vector3(Math.cos(a) * 0.17, Math.sin(a) * 0.17, 0.009), new THREE.Vector3(Math.cos(a) * 0.32, Math.sin(a) * 0.32, 0.025)], 0.0025, 6).applyMatrix4(leaf.matrix));
    }
  }
  detailBatch(parent, lilyVeins, stemMaterial);

  // The final reward is a physical flowering sculpture beneath the arch.
  const lotus = new THREE.Group();
  lotus.position.set(0.05, 0.53, -0.65);
  lotus.visible = false;
  parent.add(lotus);
  const petalMaterial = new THREE.MeshStandardMaterial({
    color: "#edb7a0",
    roughness: 0.65,
    side: THREE.DoubleSide,
    vertexColors: true,
  });
  const petals: THREE.Mesh[] = [];
  for (let i = 0; i < 12; i++) {
    const petal = new THREE.Mesh(leafGeometry, petalMaterial);
    petal.rotation.order = "YXZ";
    petal.rotation.set(0.9 + (i % 2) * 0.24, (i * Math.PI) / 6, 0);
    petal.scale.set(1.5, 0.9 + (i % 2) * 0.3, 1.5);
    petal.castShadow = true;
    lotus.add(petal);
    petals.push(petal);
  }
  const pollen = new THREE.MeshStandardMaterial({
      color: "#cfa55c",
      metalness: 0.3,
      roughness: 0.5,
    });
  const heart = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 14), pollen);
  heart.position.y = 0.23;
  lotus.add(heart);
  const stamens: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 24; i++) {
    const angle = i * 2.399;
    const radius = 0.11 + (i % 3) * 0.035;
    stamens.push(new THREE.SphereGeometry(0.025, 6, 4).translate(Math.cos(angle) * radius, 0.3 + (i % 3) * 0.035, Math.sin(angle) * radius));
  }
  detailBatch(lotus, stamens, pollen);
  const butterflies: { root: THREE.Group; wings: THREE.Mesh[] }[] = [];
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.bezierCurveTo(0.12, -0.31, 0.42, -0.28, 0.31, -0.02);
  wingShape.bezierCurveTo(0.36, 0.20, 0.12, 0.27, 0.025, 0.1);
  wingShape.closePath();
  const wingGeometry = new THREE.ShapeGeometry(wingShape, compact ? 8 : 16);
  wingGeometry.rotateX(Math.PI / 2);
  const wingMaterial = new THREE.MeshStandardMaterial({
    color: "#f1d6ac",
    roughness: 0.78,
    side: THREE.DoubleSide,
  });
  for (let i = 0; i < (compact ? 5 : 9); i++) {
    const root = new THREE.Group();
    root.visible = false;
    parent.add(root);
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), stemMaterial);
    body.scale.set(0.022, 0.023, 0.13);
    root.add(body);
    const wings = [-1, 1].map((side) => {
      const wing = new THREE.Mesh(wingGeometry, wingMaterial);
      wing.scale.x = side;
      root.add(wing);
      return wing;
    });
    butterflies.push({ root, wings });
  }
  return { lotus, petals, butterflies };
}
