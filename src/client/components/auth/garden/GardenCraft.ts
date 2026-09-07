import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** Local, deterministic micro-surface maps. No image fetch or asset decoding. */
export function craftGrain(kind: "clay" | "linen") {
  const size = 128;
  const bytes = new Uint8Array(size * size * 4);
  let seed = 719;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = (seed / 4294967296 - 0.5) * 36;
      const weave = kind === "linen" ? (x % 4 < 2 ? 13 : -13) + (y % 4 < 2 ? 13 : -13) : 0;
      const value = Math.round(150 + noise + weave);
      const offset = (y * size + x) * 4;
      bytes[offset] = bytes[offset + 1] = bytes[offset + 2] = value;
      bytes[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(bytes, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.repeat.setScalar(kind === "clay" ? 3 : 2);
  texture.needsUpdate = true;
  return texture;
}

/** Bake repeated stationary fittings into a single draw call per material. */
export function detailBatch(parent: THREE.Object3D, parts: THREE.BufferGeometry[], material: THREE.Material) {
  if (!parts.length) return;
  const geometry = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  if (!geometry) return;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function tube(points: THREE.Vector3[], radius: number, segments = 32) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segments, radius, 5, false);
}

/** A tapered, cupped surface with a raised midrib and subtle lateral veins. */
export function botanicalSurface(rows = 20, columns = 8) {
  const positions: number[] = [], colors: number[] = [], uv: number[] = [], indices: number[] = [];
  for (let row = 0; row <= rows; row++) {
    const t = row / rows;
    const width = Math.pow(Math.sin(Math.PI * t), 0.8) * 0.24;
    for (let column = 0; column <= columns; column++) {
      const s = column / columns * 2 - 1;
      const rib = Math.pow(1 - Math.abs(s), 4);
      positions.push(s * width, t, Math.sin(t * Math.PI) * (0.15 + s * s * 0.055) + rib * Math.sin(t * Math.PI) * 0.013);
      const vein = Math.pow(Math.max(0, Math.cos((t - Math.abs(s) * 0.11) * Math.PI * 18)), 12);
      const shade = 0.76 + rib * 0.18 + vein * 0.055;
      colors.push(shade, shade, shade);
      uv.push(column / columns, t);
      if (row < rows && column < columns) {
        const n = row * (columns + 1) + column;
        indices.push(n, n + 1, n + columns + 1, n + 1, n + columns + 2, n + columns + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
