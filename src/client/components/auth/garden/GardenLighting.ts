import * as THREE from "three";
import { smoothRange, type Daylight } from "./day-cycle.js";

export function createGardenLighting(
  scene: THREE.Scene,
  root: THREE.Group,
  sun: THREE.DirectionalLight,
  ambient: THREE.HemisphereLight,
  fill: THREE.DirectionalLight,
  water: THREE.MeshStandardMaterial,
  renderer: THREE.WebGLRenderer,
  compact: boolean,
) {
  const lampGlass = new THREE.MeshStandardMaterial({
    color: "#e7bd80",
    emissive: "#ffb765",
    emissiveIntensity: 0,
    roughness: 0.4,
  });
  const lampMetal = new THREE.MeshStandardMaterial({
    color: "#65705d",
    metalness: 0.6,
    roughness: 0.52,
  });
  const glassGeometry = new THREE.CylinderGeometry(0.07, 0.07, 0.15, 10);
  const capGeometry = new THREE.CylinderGeometry(0.11, 0.11, 0.025, 10);
  const stemGeometry = new THREE.CylinderGeometry(0.018, 0.023, 0.2, 6);
  const lampPositions: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3 + 0.22;
    const x = Math.sin(angle) * 2.52,
      z = Math.cos(angle) * 2.52;
    lampPositions.push([x, z]);
    const group = new THREE.Group();
    group.position.set(x, 0.48, z);
    root.add(group);
    const stem = new THREE.Mesh(stemGeometry, lampMetal);
    stem.position.y = 0.1;
    group.add(stem);
    const glass = new THREE.Mesh(glassGeometry, lampGlass);
    glass.position.y = 0.27;
    group.add(glass);
    const cap = new THREE.Mesh(capGeometry, lampMetal);
    cap.position.y = 0.36;
    group.add(cap);
  }
  const lamps = lampPositions
    .filter((_, i) => i % 2 === 0)
    .map(([x, z]) => {
      const light = new THREE.PointLight("#ffbd78", 0, 3, 2);
      light.position.set(x, 0.92, z);
      scene.add(light);
      return light;
    });
  // Small nocturnal insects use one instanced draw, not dozens of lights.
  const fireflyMaterial = new THREE.MeshBasicMaterial({
    color: "#f9dd96",
    transparent: true,
    opacity: 0,
    depthWrite: false,
    toneMapped: false,
  });
  const fireflies = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.018, 5, 4),
    fireflyMaterial,
    compact ? 8 : 18,
  );
  root.add(fireflies);
  const transform = new THREE.Object3D();
  const sunColor = new THREE.Color(),
    skyColor = new THREE.Color(),
    groundColor = new THREE.Color(),
    waterColor = new THREE.Color();
  const neutralSun = new THREE.Color("#fff2dc"),
    warmSun = new THREE.Color("#ffab62");
  const daySky = new THREE.Color("#dceaf0"),
    nightSky = new THREE.Color("#617baf"),
    warmSky = new THREE.Color("#edd1b6");
  const dayGround = new THREE.Color("#829078"),
    nightGround = new THREE.Color("#283951");
  const dayWater = new THREE.Color("#739e91"),
    nightWater = new THREE.Color("#294754");
  const direction = new THREE.Vector3();
  let lastShadowTime = -Infinity,
    lastTimestamp = NaN;
  return {
    update(day: Daylight, elapsed: number, moving: boolean, now: number) {
      const daylight = day.daylight;
      scene.environmentIntensity = 0.10 + daylight * 0.28;
      const blend = moving ? 0.12 : 1;
      direction.fromArray(day.sunDirection).multiplyScalar(13);
      direction.y = Math.max(0.15, direction.y);
      sun.position.lerp(direction, blend);
      sun.visible = day.elevation > -0.833;
      sun.intensity =
        2.8 * Math.pow(smoothRange(-0.833, 25, day.elevation), 0.3);
      sun.color.copy(sunColor.copy(neutralSun).lerp(warmSun, day.warmth * 0.9));
      ambient.color.copy(
        skyColor
          .copy(nightSky)
          .lerp(daySky, daylight)
          .lerp(warmSky, day.warmth * 0.3),
      );
      ambient.groundColor.copy(
        groundColor.copy(nightGround).lerp(dayGround, daylight),
      );
      ambient.intensity = 0.6 + daylight * 0.95;
      // Cool diffuse moonlight keeps the miniature legible when the sun is below the horizon.
      fill.color.set(daylight > 0.5 ? "#dceae7" : "#8ba8df");
      fill.intensity = 0.72 + daylight * 0.1;
      fill.position.set(-4, 7, 3);
      water.color.copy(waterColor.copy(nightWater).lerp(dayWater, daylight));
      water.roughness = 0.26 + daylight * 0.14;
      water.emissive.set("#224261");
      water.emissiveIntensity = day.night * 0.13;
      lampGlass.emissiveIntensity = day.lanterns * 3;
      lamps.forEach((lamp) => {
        lamp.intensity = day.lanterns * 1.8;
        lamp.visible = day.lanterns > 0.01;
      });
      renderer.toneMappingExposure = 1.1 + day.night * 0.2;
      fireflies.visible = day.lanterns > 0.2;
      fireflyMaterial.opacity = day.lanterns * 0.75;
      if (fireflies.visible) {
        for (let i = 0; i < fireflies.count; i++) {
          const t = moving ? elapsed : 0;
          const angle = i * 2.399 + t * (0.07 + (i % 3) * 0.01);
          const r = 1.8 + (i % 4) * 0.23;
          transform.position.set(
            Math.cos(angle) * r,
            0.75 + (i % 5) * 0.12 + Math.sin(t * 0.7 + i) * 0.12,
            Math.sin(angle) * r,
          );
          transform.scale.setScalar(
            0.6 + Math.pow((Math.sin(t * 1.2 + i * 1.8) + 1) / 2, 3) * 0.9,
          );
          transform.updateMatrix();
          fireflies.setMatrixAt(i, transform.matrix);
        }
        fireflies.instanceMatrix.needsUpdate = true;
      }
      if (
        (day.timestamp !== lastTimestamp ||
          sun.position.distanceToSquared(direction) > 0.001) &&
        now - lastShadowTime > 300
      ) {
        renderer.shadowMap.needsUpdate = true;
        lastTimestamp = day.timestamp;
        lastShadowTime = now;
      }
    },
  };
}
