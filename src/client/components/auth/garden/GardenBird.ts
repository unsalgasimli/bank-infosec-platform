import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { EXPRESSBANK_EMBLEM_PATH } from "../../common/ExpressbankLogo.js";

/**
 * Artisanal Expressbank brand monument in the Wind Garden:
 * Replaces the old songbird with a sculpted golden Expressbank emblem
 * resting on a glazed porcelain and brushed brass pedestal.
 * Retains the discovery hit targets and wings group interface for full compatibility.
 */
export function buildBird(parent: THREE.Group, compact: boolean, brass: THREE.Material) {
  const bird = new THREE.Group();
  bird.position.set(-1, 0.55, 2);
  bird.rotation.y = 0.25;
  bird.scale.setScalar(1.25);
  parent.add(bird);

  const porcelain = new THREE.MeshPhysicalMaterial({
    color: "#faf6ed",
    roughness: 0.32,
    clearcoat: 0.65,
    clearcoatRoughness: 0.2,
  });

  const goldLacquer = new THREE.MeshPhysicalMaterial({
    color: "#FAA61A",
    metalness: 0.46,
    roughness: 0.22,
    clearcoat: 0.95,
    clearcoatRoughness: 0.15,
    emissive: "#D97706",
    emissiveIntensity: 0.3,
    side: THREE.DoubleSide,
  });

  const darkSlate = new THREE.MeshStandardMaterial({
    color: "#2C3933",
    roughness: 0.75,
    metalness: 0.15,
  });

  const hits: THREE.Object3D[] = [];

  // 1. Carved Pedestal Base
  const basePlinth = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.24, 0.08, compact ? 16 : 24),
    darkSlate,
  );
  basePlinth.position.set(0, -0.04, 0);
  basePlinth.castShadow = true;
  basePlinth.receiveShadow = true;
  basePlinth.userData.discovery = "bird";
  bird.add(basePlinth);
  hits.push(basePlinth);

  const brassCollar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.16, 0.04, compact ? 16 : 24),
    brass,
  );
  brassCollar.position.set(0, 0.02, 0);
  brassCollar.castShadow = true;
  brassCollar.userData.discovery = "bird";
  bird.add(brassCollar);
  hits.push(brassCollar);

  const pedestalColumn = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.12, 0.22, compact ? 16 : 24),
    porcelain,
  );
  pedestalColumn.position.set(0, 0.15, 0);
  pedestalColumn.castShadow = true;
  pedestalColumn.userData.discovery = "bird";
  bird.add(pedestalColumn);
  hits.push(pedestalColumn);

  const capitalPlatter = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.10, 0.035, compact ? 16 : 24),
    brass,
  );
  capitalPlatter.position.set(0, 0.28, 0);
  capitalPlatter.castShadow = true;
  capitalPlatter.userData.discovery = "bird";
  bird.add(capitalPlatter);
  hits.push(capitalPlatter);

  // 2. Sculpted Expressbank 3D Emblem
  try {
    const loader = new SVGLoader();
    const svgMarkup = `<svg viewBox="0 0 40 30"><path fill-rule="evenodd" clip-rule="evenodd" d="${EXPRESSBANK_EMBLEM_PATH}"/></svg>`;
    const parsed = loader.parse(svgMarkup);
    const shapes = SVGLoader.createShapes(parsed.paths[0]);

    const emblemGeo = new THREE.ExtrudeGeometry(shapes, {
      depth: 2.4,
      bevelEnabled: true,
      bevelSegments: compact ? 3 : 5,
      bevelThickness: 0.6,
      bevelSize: 0.45,
      curveSegments: compact ? 20 : 32,
    });
    emblemGeo.center();
    // Invert Y to match Three.js coordinate system and scale to pedestal size
    emblemGeo.scale(0.0125, -0.0125, 0.0125);
    emblemGeo.computeVertexNormals();

    const emblemMesh = new THREE.Mesh(emblemGeo, goldLacquer);
    emblemMesh.position.set(0, 0.48, 0);
    emblemMesh.castShadow = true;
    emblemMesh.receiveShadow = true;
    emblemMesh.userData.discovery = "bird";
    bird.add(emblemMesh);
    hits.push(emblemMesh);
  } catch {
    // Fallback torus knot / gem if SVG parsing fails
    const fallback = new THREE.Mesh(
      new THREE.TorusGeometry(0.12, 0.04, 12, 24),
      goldLacquer,
    );
    fallback.position.set(0, 0.48, 0);
    fallback.userData.discovery = "bird";
    bird.add(fallback);
    hits.push(fallback);
  }

  // Soft luminous aura around the brand monument
  const emblemGlow = new THREE.PointLight("#FFA000", 1.2, 2.5);
  emblemGlow.position.set(0, 0.48, 0.08);
  bird.add(emblemGlow);

  const wings: THREE.Mesh[] = [];
  return { bird, wings, hits };
}
