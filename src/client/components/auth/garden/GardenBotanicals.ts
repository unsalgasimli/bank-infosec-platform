import * as THREE from "three";

/** Shared curved leaf surfaces, instanced across the planted pockets. */
export function buildBotanicals(parent: THREE.Group, compact: boolean) {
  const leafGeometry = new THREE.BufferGeometry();
  const vertices: number[] = [],
    indices: number[] = [];
  for (let row = 0; row <= 12; row++) {
    const t = row / 12;
    const width = Math.sin(Math.PI * t) * 0.23;
    for (let side = 0; side < 3; side++) {
      vertices.push(
        (side - 1) * width,
        t,
        Math.sin(t * Math.PI) * 0.2 + (side === 1 ? 0.05 : 0),
      );
      if (row < 12 && side < 2) {
        const n = row * 3 + side;
        indices.push(n, n + 3, n + 1, n + 1, n + 3, n + 4);
      }
    }
  }
  leafGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  leafGeometry.setIndex(indices);
  leafGeometry.computeVertexNormals();
  const leafMaterial = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.85,
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
  }
  leaves.castShadow = true;
  leaves.receiveShadow = true;
  parent.add(leaves);

  // Broad floating lily leaves give the water a living edge.
  const lilyMaterial = new THREE.MeshStandardMaterial({
    color: "#769778",
    roughness: 0.72,
    side: THREE.DoubleSide,
  });
  const lilyGeometry = new THREE.CircleGeometry(
    0.34,
    24,
    0.15,
    Math.PI * 2 - 0.3,
  );
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
  }

  // The final reward is a physical flowering sculpture beneath the arch.
  const lotus = new THREE.Group();
  lotus.position.set(0.05, 0.53, -0.65);
  lotus.visible = false;
  parent.add(lotus);
  const petalMaterial = new THREE.MeshStandardMaterial({
    color: "#edb7a0",
    roughness: 0.65,
    side: THREE.DoubleSide,
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
  const heart = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.19, 1),
    new THREE.MeshStandardMaterial({
      color: "#cfa55c",
      metalness: 0.3,
      roughness: 0.5,
    }),
  );
  heart.position.y = 0.23;
  lotus.add(heart);
  const butterflies: { root: THREE.Group; wings: THREE.Mesh[] }[] = [];
  const wingGeometry = new THREE.BufferGeometry();
  wingGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        0, 0, 0, 0.32, 0.04, -0.15, 0.23, 0.08, 0.19, 0, 0, 0, 0.23, 0.08, 0.19,
        0.08, 0, 0.26,
      ],
      3,
    ),
  );
  wingGeometry.computeVertexNormals();
  const wingMaterial = new THREE.MeshStandardMaterial({
    color: "#f1d6ac",
    roughness: 0.78,
    side: THREE.DoubleSide,
  });
  for (let i = 0; i < (compact ? 5 : 9); i++) {
    const root = new THREE.Group();
    root.visible = false;
    parent.add(root);
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
