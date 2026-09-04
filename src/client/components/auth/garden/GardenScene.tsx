import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { buildGarden } from "./GardenObjects.js";
import { gardenSolved, type GardenPresentation } from "./garden-state.js";

interface Props extends GardenPresentation {
  onTurn: (index: number) => void;
  onReady: () => void;
  onUnavailable: () => void;
  onLowPerformance: () => void;
  onDiscovery: (kind: "bird" | "bell") => void;
}

export default function GardenScene(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const invalidate = useRef<() => void>(() => {});
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    const compact = window.matchMedia("(max-width: 1000px)").matches;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "low-power",
      });
    } catch {
      latest.current.onUnavailable();
      return;
    }
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, compact ? 1.25 : 1.75),
    );
    renderer.shadowMap.enabled = !compact;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.domElement.setAttribute("aria-hidden", "true");
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog("#ede9df", 17, 33);
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 65);
    const ambient = new THREE.HemisphereLight("#f6f4ec", "#7b9586", 2);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight("#fff4e7", 3.3);
    sun.position.set(-5, 9, 5);
    sun.castShadow = !compact;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -7;
    sun.shadow.camera.right = 7;
    sun.shadow.camera.top = 7;
    sun.shadow.camera.bottom = -7;
    sun.shadow.normalBias = 0.025;
    sun.shadow.bias = -0.0002;
    scene.add(sun);
    const fill = new THREE.DirectionalLight("#e0eeeb", 1.4);
    fill.position.set(5, 3, -4);
    scene.add(fill);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.ShadowMaterial({ opacity: 0.09 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.18;
    floor.receiveShadow = true;
    scene.add(floor);
    const world = buildGarden(scene, compact);
    const timeUniform = { value: 0 };
    const rippleUniform = { value: new THREE.Vector3(0, 0, -100) };
    const waterMaterial = new THREE.MeshStandardMaterial({
      color: "#739e91",
      roughness: 0.4,
      metalness: 0.12,
    });
    waterMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.gardenTime = timeUniform;
      shader.uniforms.gardenRipple = rippleUniform;
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nvarying vec3 gardenPosition;",
        )
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\ngardenPosition = position;",
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          "#include <common>\nvarying vec3 gardenPosition; uniform float gardenTime; uniform vec3 gardenRipple;",
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
        float a = sin(gardenPosition.x * 4.0 + gardenPosition.y * 13.0 + sin(gardenPosition.x * 3.0 + gardenTime * .25));
        float light = pow(max(0.0, a), 20.0) * .027;
        float age = gardenTime - gardenRipple.z;
        float dist = length(gardenPosition.xy - gardenRipple.xy);
        float ripple = sin(dist * 24.0 - age * 6.0) * exp(-abs(dist-age*.65)*5.0) * max(0.0,1.0-age/4.0) * .08;
        diffuseColor.rgb += light + ripple;`,
        );
    };
    const water = new THREE.Mesh(
      new THREE.CircleGeometry(4.65, compact ? 64 : 100),
      waterMaterial,
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = -0.045;
    water.receiveShadow = true;
    scene.add(water);
    const shore = new THREE.Mesh(
      new THREE.CylinderGeometry(4.71, 4.71, 0.1, 100),
      new THREE.MeshStandardMaterial({ color: "#d1c7ad", roughness: 1 }),
    );
    shore.position.y = -0.12;
    scene.add(shore);
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let dragging = false,
      dragged = false,
      downX = 0,
      downY = 0,
      lastX = 0,
      lastY = 0;
    let orbit = 0.18,
      elevation = 0.48,
      targetOrbit = 0.18,
      targetElevation = 0.48;
    let elapsed = 0,
      lastTime = 0,
      frames = 0,
      frameCost = 0,
      entry = 0,
      gustTime = -100,
      birdTime = -100,
      bellTime = -100;
    let celebrationTime = -100,
      wasFinished = false;
    let seenGust = 0,
      seenReset = 0,
      disposed = false,
      failed = false,
      looping = false,
      inViewport = true;
    const aim = new THREE.Vector3(0, 1.48, 0);
    const entryPosition = new THREE.Vector3(0, 2.35, -0.5);
    const flowerScale = new THREE.Vector3();
    const clayColor = new THREE.Color();
    function pick(event: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObjects(world.hitObjects, false)[0];
    }
    function render(now: number) {
      if (disposed || failed || document.hidden || !inViewport) return;
      const p = latest.current;
      const moving = !p.paused && !p.reducedMotion;
      const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.05) : 0;
      lastTime = now;
      if (moving) elapsed += dt;
      const blend = moving ? 1 - Math.exp(-dt * 7) : 1;
      if (p.resetView !== seenReset) {
        targetOrbit = 0.18;
        targetElevation = 0.48;
        seenReset = p.resetView;
      }
      if (p.gust !== seenGust) {
        seenGust = p.gust;
        birdTime = elapsed;
        gustTime = elapsed;
        rippleUniform.value.set(1, -2, elapsed);
      }
      if (p.phase === "entering" && !p.reducedMotion)
        entry = Math.min(1, entry + dt / 0.8);
      orbit += (targetOrbit - orbit) * blend;
      elevation += (targetElevation - elevation) * blend;
      const radius =
        (compact ? 17.5 : 15.4) * Math.max(1, 1.05 / camera.aspect);
      camera.position.set(
        Math.sin(orbit) * Math.cos(elevation) * radius,
        Math.sin(elevation) * radius,
        Math.cos(orbit) * Math.cos(elevation) * radius,
      );
      const travel = entry * entry * (3 - 2 * entry);
      camera.position.lerp(entryPosition, travel);
      camera.lookAt(aim);
      world.instruments.forEach((wheel, i) => {
        const angle = (-p.state.turns[i] * Math.PI) / 4;
        wheel.rotation.z += (angle - wheel.rotation.z) * blend;
        const gustAge = elapsed - gustTime;
        wheel.rotation.y = moving
          ? Math.sin(elapsed * 0.45 + i) * 0.055 +
            pointer.x * 0.035 +
            (gustAge < 4
              ? Math.sin(gustAge * 8 - i) * Math.exp(-gustAge) * 0.25
              : 0)
          : 0;
        world.targetMarks[i].rotation.z = (-p.state.targets[i] * Math.PI) / 4;
      });
      const solved = gardenSolved(p.state);
      const bloomed = p.state.chapter === 2 || solved;
      const finished = p.state.chapter === 2 && solved;
      if (finished && !wasFinished) {
        celebrationTime = elapsed;
        bellTime = elapsed;
        gustTime = elapsed;
        rippleUniform.value.set(0, 0, elapsed);
      }
      wasFinished = finished;
      const celebrationAge = elapsed - celebrationTime;
      world.flowers.forEach((flower, i) => {
        const scale = bloomed ? 1 : 0.001;
        flower.visible = bloomed;
        flower.scale.lerp(flowerScale.setScalar(scale), blend);
        if (moving && bloomed) flower.rotation.z = Math.sin(elapsed + i) * 0.08;
      });
      world.botanicals.lotus.visible = finished;
      const unfurl = moving ? Math.min(1, celebrationAge / 2.5) : 1;
      world.botanicals.lotus.scale.setScalar(0.1 + unfurl * 1.1);
      world.botanicals.petals.forEach((petal, i) => {
        petal.rotation.x = 0.12 + unfurl * (0.85 + (i % 2) * 0.22);
      });
      world.botanicals.butterflies.forEach(({ root, wings }, i) => {
        root.visible = finished;
        const flying = moving && celebrationAge < 16;
        const angle = i * 2.399 + (flying ? celebrationAge * 0.7 : 0);
        const radius = flying ? 1.1 + (i % 3) * 0.4 : 1.8;
        root.position.set(
          Math.cos(angle) * radius,
          flying
            ? 0.8 +
                Math.min(celebrationAge * 0.4, 2.7) +
                Math.sin(celebrationAge * 1.5 + i) * 0.25
            : 0.9 + (i % 3) * 0.12,
          -0.45 + Math.sin(angle) * radius,
        );
        root.rotation.y = -angle;
        wings.forEach((wing, side) => {
          wing.rotation.z =
            (side ? 1 : -1) *
            (flying ? Math.sin(celebrationAge * 14 + i) * 0.75 : 0.35);
        });
      });
      const hop = elapsed - birdTime;
      world.bird.position.y =
        0.63 +
        (moving && hop < 1.3
          ? Math.sin(Math.min(1, hop / 1.3) * Math.PI) * 0.7
          : 0);
      world.bird.rotation.y =
        Math.PI +
        orbit +
        (moving ? Math.sin(elapsed * 0.24) * 0.12 + pointer.x * 0.15 : 0);
      const birdFlight =
        finished && moving && celebrationAge > 1 && celebrationAge < 10;
      const birdArc = birdFlight ? ((celebrationAge - 1) / 9) * Math.PI : 0;
      world.bird.position.x = -1 + Math.sin(birdArc * 2) * 1.6;
      world.bird.position.z = 2 - Math.sin(birdArc) * 2.8;
      world.bird.position.y += Math.sin(birdArc) * 2.6;
      world.wings.forEach(
        (wing, i) =>
          (wing.rotation.z =
            (i ? 1 : -1) *
            (0.8 +
              (birdFlight
                ? Math.sin(celebrationAge * 19) * 0.75
                : moving && hop < 1.3
                  ? Math.sin(hop * 23) * 0.55
                  : 0))),
      );
      const bellAge = elapsed - bellTime;
      world.bellPivot.rotation.z =
        moving && bellAge < 4
          ? Math.sin(bellAge * 12) * Math.exp(-bellAge) * 0.3
          : 0;
      const flight = elapsed % 53;
      world.glider.visible = moving && flight > 34 && flight < 45;
      world.glider.position.set(
        (flight - 39.5) * 1.3,
        4.8 + Math.sin(flight * 0.7) * 0.35,
        -2,
      );
      world.glider.rotation.set(0.12, -Math.PI / 2, Math.sin(flight) * 0.13);
      timeUniform.value = elapsed;
      // A subdued local response; errors never flash the viewport.
      world.clay.color.lerp(
        clayColor.set(p.phase === "error" ? "#a46450" : "#bd7355"),
        blend,
      );
      renderer.render(scene, camera);
      if (moving && dt > 0) {
        frameCost += dt;
        frames++;
        if (frames === 90) {
          if (frameCost / frames > 0.024) {
            const dpr = renderer.getPixelRatio();
            if (dpr > 1) renderer.setPixelRatio(1);
            else if (dpr > 0.75) {
              renderer.setPixelRatio(0.75);
              renderer.shadowMap.enabled = false;
              scene.traverse((object) => {
                if (object instanceof THREE.Mesh) {
                  const materials = Array.isArray(object.material)
                    ? object.material
                    : [object.material];
                  materials.forEach((material) => {
                    material.needsUpdate = true;
                  });
                }
              });
            } else if (frameCost / frames > 0.04)
              latest.current.onLowPerformance();
          }
          frames = 0;
          frameCost = 0;
        }
      }
    }
    function syncLoop() {
      if (disposed || failed) return;
      const p = latest.current;
      const shouldLoop =
        !document.hidden &&
        inViewport &&
        ((!p.paused && !p.reducedMotion) ||
          (p.phase === "entering" && !p.reducedMotion));
      if (shouldLoop !== looping) {
        looping = shouldLoop;
        lastTime = 0;
        renderer.setAnimationLoop(shouldLoop ? render : null);
      }
      if (!shouldLoop && !document.hidden && inViewport)
        render(performance.now());
    }
    invalidate.current = () => {
      renderer.shadowMap.needsUpdate = true;
      render(performance.now());
      syncLoop();
    };
    function resize() {
      const { width, height } = container!.getBoundingClientRect();
      if (width < 1 || height < 1) return;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      invalidate.current();
    }
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    const intersection = new IntersectionObserver((entries) => {
      inViewport = entries[0]?.isIntersecting ?? true;
      syncLoop();
    });
    intersection.observe(container);
    const down = (event: PointerEvent) => {
      if (event.button !== 0) return;
      dragging = true;
      dragged = false;
      downX = lastX = event.clientX;
      downY = lastY = event.clientY;
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (dragging) {
        if (Math.hypot(event.clientX - downX, event.clientY - downY) > 5)
          dragged = true;
        if (!compact && !latest.current.reducedMotion) {
          targetOrbit = THREE.MathUtils.clamp(
            targetOrbit + (event.clientX - lastX) * 0.004,
            -0.65,
            0.75,
          );
          targetElevation = THREE.MathUtils.clamp(
            targetElevation + (event.clientY - lastY) * 0.002,
            0.25,
            0.75,
          );
        }
        lastX = event.clientX;
        lastY = event.clientY;
        invalidate.current();
      } else {
        renderer.domElement.style.cursor = pick(event)
          ? "pointer"
          : compact
            ? "default"
            : "grab";
      }
    };
    const up = (event: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      if (renderer.domElement.hasPointerCapture(event.pointerId))
        renderer.domElement.releasePointerCapture(event.pointerId);
      if (dragged) return;
      const hit = pick(event);
      if (hit?.object.userData.instrument !== undefined)
        latest.current.onTurn(hit.object.userData.instrument);
      else if (hit?.object.userData.discovery) {
        const kind = hit.object.userData.discovery as "bird" | "bell";
        if (kind === "bird") birdTime = elapsed;
        else bellTime = elapsed;
        latest.current.onDiscovery(kind);
      } else {
        const waterHit = raycaster.intersectObject(water)[0];
        if (waterHit)
          rippleUniform.value.set(waterHit.point.x, -waterHit.point.z, elapsed);
      }
      invalidate.current();
    };
    const cancel = () => {
      dragging = false;
    };
    const lost = (event: Event) => {
      event.preventDefault();
      failed = true;
      renderer.setAnimationLoop(null);
      latest.current.onUnavailable();
    };
    renderer.domElement.addEventListener("pointerdown", down);
    renderer.domElement.addEventListener("pointermove", move);
    renderer.domElement.addEventListener("pointerup", up);
    renderer.domElement.addEventListener("pointercancel", cancel);
    renderer.domElement.addEventListener("webglcontextlost", lost);
    document.addEventListener("visibilitychange", syncLoop);
    resize();
    syncLoop();
    latest.current.onReady();
    return () => {
      disposed = true;
      invalidate.current = () => {};
      observer.disconnect();
      intersection.disconnect();
      renderer.setAnimationLoop(null);
      document.removeEventListener("visibilitychange", syncLoop);
      renderer.domElement.removeEventListener("pointerdown", down);
      renderer.domElement.removeEventListener("pointermove", move);
      renderer.domElement.removeEventListener("pointerup", up);
      renderer.domElement.removeEventListener("pointercancel", cancel);
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          geometries.add(object.geometry);
          (Array.isArray(object.material)
            ? object.material
            : [object.material]
          ).forEach((material) => materials.add(material));
          if (object instanceof THREE.InstancedMesh) object.dispose();
        }
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      sun.shadow.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);
  useEffect(() => {
    invalidate.current();
  }, [
    props.state,
    props.phase,
    props.paused,
    props.reducedMotion,
    props.gust,
    props.resetView,
  ]);
  return <div ref={host} className="garden-scene" />;
}
