import * as THREE from "three";
import { detailBatch, tube } from "./GardenCraft.js";

/** Glazed porcelain songbird; the wing pivots retain the existing flight rig. */
export function buildBird(parent: THREE.Group, compact: boolean, brass: THREE.Material) {
  const bird = new THREE.Group();
  bird.position.set(-1, 0.63, 2);
  bird.rotation.y = Math.PI + 0.18;
  bird.scale.setScalar(1.35);
  parent.add(bird);
  const porcelain = new THREE.MeshPhysicalMaterial({ color: "#eee5cf", roughness: 0.38, clearcoat: 0.32, clearcoatRoughness: 0.3 });
  const featherMaterial = new THREE.MeshStandardMaterial({ color: "#c9cbb5", roughness: 0.64 });
  const dark = new THREE.MeshPhysicalMaterial({ color: "#222f2b", roughness: 0.22, clearcoat: 0.6 });
  const sphere = new THREE.SphereGeometry(1, compact ? 16 : 24, compact ? 12 : 18);
  const hits: THREE.Object3D[] = [];
  const ellipsoid = (material: THREE.Material, position: number[], scale: number[], target: THREE.Object3D = bird) => {
    const mesh = new THREE.Mesh(sphere, material);
    mesh.position.set(position[0], position[1], position[2]);
    mesh.scale.set(scale[0], scale[1], scale[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.discovery = "bird";
    target.add(mesh);
    hits.push(mesh);
    return mesh;
  };
  ellipsoid(porcelain, [0, 0.105, 0.025], [0.135, 0.16, 0.235]);
  ellipsoid(porcelain, [0, 0.285, -0.15], [0.10, 0.11, 0.105]);
  // Rounded breast and swept crown replace the old cone silhouette.
  ellipsoid(porcelain, [0, 0.15, -0.12], [0.108, 0.14, 0.115]);
  [-1, 1].forEach((side) => {
    ellipsoid(featherMaterial, [side * 0.079, 0.29, -0.198], [0.027, 0.035, 0.012]);
    ellipsoid(dark, [side * 0.087, 0.302, -0.208], [0.015, 0.017, 0.012]);
    ellipsoid(porcelain, [side * 0.09, 0.308, -0.217], [0.004, 0.004, 0.003]);
  });
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.105, 8), brass);
  beak.rotation.x = -Math.PI / 2;
  beak.position.set(0, 0.278, -0.282);
  bird.add(beak);
  const wings: THREE.Mesh[] = [];
  [-1, 1].forEach((side) => {
    const geometry = sphere.clone().scale(0.07, 0.16, 0.055).translate(side * 0.035, -0.04, 0.065);
    const wing = new THREE.Mesh(geometry, porcelain);
    wing.position.set(side * 0.10, 0.16, 0.035);
    wing.castShadow = true;
    wing.userData.discovery = "bird";
    bird.add(wing);
    hits.push(wing);
    wings.push(wing);
    const feathers: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 5; i++) {
      const feather = sphere.clone().scale(0.021, 0.115 - i * 0.009, 0.018);
      feather.rotateZ(side * (0.10 + i * 0.095));
      feather.translate(side * (-0.012 + i * 0.022), -0.085 + i * 0.012, 0.114);
      feathers.push(feather);
    }
    detailBatch(wing, feathers, featherMaterial);
  });
  const tail: THREE.BufferGeometry[] = [];
  for (let i = -1; i <= 1; i++) tail.push(sphere.clone().scale(0.036, 0.025, 0.18).rotateY(i * 0.14).translate(i * 0.038, 0.07, 0.29));
  detailBatch(bird, tail, featherMaterial);
  const feet: THREE.BufferGeometry[] = [];
  [-1, 1].forEach((side) => {
    const x = side * 0.063;
    feet.push(tube([new THREE.Vector3(x, -0.01, 0.02), new THREE.Vector3(x, -0.10, 0.015), new THREE.Vector3(x, -0.115, -0.06)], 0.009, 8));
    for (let toe = -1; toe <= 1; toe++) feet.push(tube([new THREE.Vector3(x, -0.115, -0.01), new THREE.Vector3(x + toe * 0.021, -0.116, -0.077)], 0.005, 3));
  });
  detailBatch(bird, feet, brass);
  return { bird, wings, hits };
}
