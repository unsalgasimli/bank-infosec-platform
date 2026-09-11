import React, { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import {
  Eye,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  X,
  Layers,
  Palette,
  Info,
} from "lucide-react";
import { EXPRESSBANK_EMBLEM_PATH, ExpressbankEmblem } from "./ExpressbankLogo.js";
import "./expressbank-3d-inspector.css";

type MaterialPreset = "gold" | "platinum" | "obsidian" | "hologram";

interface Expressbank3DInspectorProps {
  isOpen: boolean;
  onClose: () => void;
  language?: "az" | "en";
}

export const Expressbank3DInspector: React.FC<Expressbank3DInspectorProps> = ({
  isOpen,
  onClose,
  language = "az",
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeMaterial, setActiveMaterial] = useState<MaterialPreset>("gold");
  const [autoRotate, setAutoRotate] = useState(true);
  const [showWireframe, setShowWireframe] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  // References to communicate with the Three.js animation loop without re-instantiating
  const sceneState = useRef({
    materialPreset: "gold" as MaterialPreset,
    autoRotate: true,
    wireframe: false,
    resetTrigger: 0,
  });

  sceneState.current.materialPreset = activeMaterial;
  sceneState.current.autoRotate = autoRotate;
  sceneState.current.wireframe = showWireframe;

  const copy = useCallback(
    (en: string, az: string) => (language === "az" ? az : en),
    [language],
  );

  const resetCamera = useCallback(() => {
    sceneState.current.resetTrigger += 1;
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "r" || e.key === "R") {
        resetCamera();
      } else if (e.key === " ") {
        e.preventDefault();
        setAutoRotate((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, resetCamera]);

  useEffect(() => {
    if (!isOpen) return;
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;

    // 1. Renderer Setup
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    container.appendChild(renderer.domElement);

    // 2. Scene & Environment
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const envTexture = pmrem.fromScene(room, 0.05).texture;
    scene.environment = envTexture;
    room.dispose();
    pmrem.dispose();

    // 3. Camera Setup
    const camera = new THREE.PerspectiveCamera(
      38,
      container.clientWidth / container.clientHeight,
      0.1,
      100,
    );
    const defaultCamDist = 4.2;
    camera.position.set(0, 0.2, defaultCamDist);
    camera.lookAt(0, 0, 0);

    // 4. Lighting Rig
    const ambientLight = new THREE.AmbientLight("#ffffff", 0.85);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight("#fff2db", 2.8);
    keyLight.position.set(4, 6, 4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight("#4dc9ff", 1.8);
    rimLight.position.set(-5, 3, -4);
    scene.add(rimLight);

    const warmUnderLight = new THREE.DirectionalLight("#e08800", 1.2);
    warmUnderLight.position.set(0, -4, 2);
    scene.add(warmUnderLight);

    // Follower cursor light for interactive specular reflections
    const pointerLight = new THREE.PointLight("#ffca38", 1.5, 8);
    pointerLight.position.set(0, 0, 2.5);
    scene.add(pointerLight);

    // 5. Materials
    const materials: Record<MaterialPreset, THREE.Material> = {
      gold: new THREE.MeshPhysicalMaterial({
        color: "#FAA61A",
        metalness: 0.65,
        roughness: 0.18,
        clearcoat: 0.95,
        clearcoatRoughness: 0.1,
        emissive: "#b87000",
        emissiveIntensity: 0.22,
        side: THREE.DoubleSide,
      }),
      platinum: new THREE.MeshPhysicalMaterial({
        color: "#E2E8F0",
        metalness: 0.92,
        roughness: 0.14,
        clearcoat: 1.0,
        clearcoatRoughness: 0.06,
        emissive: "#64748B",
        emissiveIntensity: 0.12,
        side: THREE.DoubleSide,
      }),
      obsidian: new THREE.MeshPhysicalMaterial({
        color: "#182026",
        metalness: 0.85,
        roughness: 0.28,
        clearcoat: 0.8,
        clearcoatRoughness: 0.2,
        emissive: "#0A2540",
        emissiveIntensity: 0.4,
        side: THREE.DoubleSide,
      }),
      hologram: new THREE.MeshStandardMaterial({
        color: "#00f0ff",
        metalness: 0.1,
        roughness: 0.3,
        wireframe: true,
        emissive: "#00a2ff",
        emissiveIntensity: 0.8,
        side: THREE.DoubleSide,
      }),
    };

    // 6. Geometry Generation from SVG
    const rootPivot = new THREE.Group();
    scene.add(rootPivot);

    const emblemGroup = new THREE.Group();
    rootPivot.add(emblemGroup);

    let emblemMesh: THREE.Mesh | null = null;
    try {
      const loader = new SVGLoader();
      const svgMarkup = `<svg viewBox="0 0 40 30"><path fill-rule="evenodd" clip-rule="evenodd" d="${EXPRESSBANK_EMBLEM_PATH}"/></svg>`;
      const parsed = loader.parse(svgMarkup);
      const shapes = SVGLoader.createShapes(parsed.paths[0]);

      const emblemGeo = new THREE.ExtrudeGeometry(shapes, {
        depth: 2.8,
        bevelEnabled: true,
        bevelSegments: 6,
        bevelThickness: 0.7,
        bevelSize: 0.52,
        curveSegments: 48,
      });
      emblemGeo.center();
      // True orientation: inverting Y for SVG top-down mapping, scale to viewport
      emblemGeo.scale(0.082, -0.082, 0.082);
      emblemGeo.computeVertexNormals();

      emblemMesh = new THREE.Mesh(emblemGeo, materials.gold);
      emblemMesh.castShadow = true;
      emblemMesh.receiveShadow = true;
      emblemGroup.add(emblemMesh);
    } catch {
      const fallbackGeo = new THREE.TorusGeometry(0.8, 0.25, 24, 48);
      emblemMesh = new THREE.Mesh(fallbackGeo, materials.gold);
      emblemGroup.add(emblemMesh);
    }

    // Floor shadow circle for grounding the 3D model
    const shadowCircle = new THREE.Mesh(
      new THREE.CircleGeometry(1.6, 48),
      new THREE.MeshBasicMaterial({
        color: "#000000",
        transparent: true,
        opacity: 0.35,
      }),
    );
    shadowCircle.rotation.x = -Math.PI / 2;
    shadowCircle.position.y = -1.4;
    scene.add(shadowCircle);

    // Subtle floating dust motes
    const particleCount = 40;
    const particleGeo = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount * 3; i += 3) {
      particlePositions[i] = (Math.random() - 0.5) * 6;
      particlePositions[i + 1] = (Math.random() - 0.5) * 4;
      particlePositions[i + 2] = (Math.random() - 0.5) * 4;
    }
    particleGeo.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: "#ffd580",
      size: 0.035,
      transparent: true,
      opacity: 0.5,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // 7. Drop-in Entrance Physics State
    // Start above screen so it drops down in dramatic fashion
    let dropY = 4.2;
    let dropVelocity = 0;
    const targetY = 0;
    let entranceComplete = false;

    // 8. Interactive Orbit & Drag Controls
    let isDragging = false;
    let isPanning = false;
    let prevPointerX = 0;
    let prevPointerY = 0;
    let targetRotationX = 0;
    let targetRotationY = 0;
    let curRotationX = 0;
    let curRotationY = 0;
    let targetDistance = defaultCamDist;
    let curDistance = defaultCamDist;
    let panOffsetX = 0;
    let panOffsetY = 0;
    let targetPanX = 0;
    let targetPanY = 0;
    let lastResetCounter = sceneState.current.resetTrigger;

    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      if (e.button === 2) {
        isPanning = true;
      } else {
        isDragging = true;
      }
      prevPointerX = e.clientX;
      prevPointerY = e.clientY;
      renderer.domElement.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      pointerLight.position.x = ndcX * 3;
      pointerLight.position.y = ndcY * 2.5;

      if (isDragging) {
        const deltaX = e.clientX - prevPointerX;
        const deltaY = e.clientY - prevPointerY;
        targetRotationY += deltaX * 0.012;
        targetRotationX = THREE.MathUtils.clamp(
          targetRotationX + deltaY * 0.01,
          -Math.PI / 2.2,
          Math.PI / 2.2,
        );
        prevPointerX = e.clientX;
        prevPointerY = e.clientY;
      } else if (isPanning) {
        const deltaX = e.clientX - prevPointerX;
        const deltaY = e.clientY - prevPointerY;
        targetPanX += deltaX * 0.004;
        targetPanY -= deltaY * 0.004;
        prevPointerX = e.clientX;
        prevPointerY = e.clientY;
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      isDragging = false;
      isPanning = false;
      if (renderer.domElement.hasPointerCapture(e.pointerId)) {
        renderer.domElement.releasePointerCapture(e.pointerId);
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      targetDistance = THREE.MathUtils.clamp(
        targetDistance + e.deltaY * 0.003,
        1.8,
        8.0,
      );
    };

    const dom = renderer.domElement;
    dom.addEventListener("pointerdown", onPointerDown);
    dom.addEventListener("pointermove", onPointerMove);
    dom.addEventListener("pointerup", onPointerUp);
    dom.addEventListener("pointercancel", onPointerUp);
    dom.addEventListener("wheel", onWheel, { passive: false });
    dom.addEventListener("contextmenu", (e) => e.preventDefault());

    // 9. Resize Handling
    const handleResize = () => {
      if (!container || disposed) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    // 10. Main Animation Loop
    let clock = new THREE.Clock();
    let animId = 0;

    const animate = () => {
      if (disposed) return;
      animId = requestAnimationFrame(animate);

      const dt = Math.min(clock.getDelta(), 0.05);

      // Check reset
      if (sceneState.current.resetTrigger !== lastResetCounter) {
        lastResetCounter = sceneState.current.resetTrigger;
        targetRotationX = 0;
        targetRotationY = 0;
        targetDistance = defaultCamDist;
        targetPanX = 0;
        targetPanY = 0;
      }

      // Entrance drop physics (smooth damped spring)
      if (!entranceComplete) {
        const force = (targetY - dropY) * 38;
        dropVelocity += force * dt;
        dropVelocity *= Math.pow(0.12, dt);
        dropY += dropVelocity * dt;

        if (Math.abs(dropY - targetY) < 0.005 && Math.abs(dropVelocity) < 0.01) {
          dropY = targetY;
          entranceComplete = true;
        }
      }

      emblemGroup.position.y = dropY;

      // Auto-rotation when not user dragging
      if (sceneState.current.autoRotate && !isDragging) {
        targetRotationY += 0.8 * dt;
      }

      // Smooth interpolation for orbit & zoom
      curRotationX = THREE.MathUtils.damp(curRotationX, targetRotationX, 14, dt);
      curRotationY = THREE.MathUtils.damp(curRotationY, targetRotationY, 14, dt);
      curDistance = THREE.MathUtils.damp(curDistance, targetDistance, 12, dt);
      panOffsetX = THREE.MathUtils.damp(panOffsetX, targetPanX, 12, dt);
      panOffsetY = THREE.MathUtils.damp(panOffsetY, targetPanY, 12, dt);

      rootPivot.rotation.x = curRotationX;
      rootPivot.rotation.y = curRotationY;
      rootPivot.position.x = panOffsetX;
      rootPivot.position.y = panOffsetY;

      camera.position.z = curDistance;

      // Update material and wireframe if changed
      if (emblemMesh) {
        const currentMat = materials[sceneState.current.materialPreset];
        if (emblemMesh.material !== currentMat) {
          emblemMesh.material = currentMat;
        }
        if (
          "wireframe" in currentMat &&
          sceneState.current.materialPreset !== "hologram"
        ) {
          (currentMat as THREE.MeshStandardMaterial).wireframe =
            sceneState.current.wireframe;
        }
      }

      // Floating particles motion
      particles.rotation.y += 0.1 * dt;

      // Shadow opacity scales with drop height
      shadowCircle.scale.setScalar(
        THREE.MathUtils.clamp(1 - (dropY / 4.2) * 0.4, 0.4, 1.1),
      );

      renderer.render(scene, camera);
    };

    animId = requestAnimationFrame(animate);

    return () => {
      disposed = true;
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
      dom.removeEventListener("pointerdown", onPointerDown);
      dom.removeEventListener("pointermove", onPointerMove);
      dom.removeEventListener("pointerup", onPointerUp);
      dom.removeEventListener("pointercancel", onPointerUp);
      dom.removeEventListener("wheel", onWheel);
      if (renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement);
      }
      renderer.dispose();
      envTexture.dispose();
      Object.values(materials).forEach((m) => m.dispose());
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="eb-inspector"
      role="dialog"
      aria-modal="true"
      aria-label={copy("Expressbank 3D Emblem Inspector", "Expressbank 3D Loqo İnspektoru")}
    >
      <div className="eb-inspector__backdrop" onClick={onClose} />

      <div className="eb-inspector__container">
        {/* Header bar */}
        <header className="eb-inspector__header">
          <div className="eb-inspector__brand">
            <div className="eb-inspector__logo-badge">
              <ExpressbankEmblem size={22} glow />
            </div>
            <div>
              <h2 className="eb-inspector__title">
                EXPRESSBANK <span>3D</span>
              </h2>
              <p className="eb-inspector__subtitle">
                {copy(
                  "Interactive Brand Geometry & Craftsmanship Inspection",
                  "İnteraktiv Brend Həndəsəsi və İncəsənət Təftişi",
                )}
              </p>
            </div>
          </div>

          <div className="eb-inspector__header-actions">
            <button
              type="button"
              className="eb-inspector__btn-ghost"
              onClick={() => setShowInfo((prev) => !prev)}
              title={copy("Emblem Specifications", "Loqo Detalları")}
              aria-expanded={showInfo}
            >
              <Info size={16} />
              <span>{copy("Details", "Detallar")}</span>
            </button>
            <button
              type="button"
              className="eb-inspector__close-btn"
              onClick={onClose}
              aria-label={copy("Close 3D View (Esc)", "3D Görünüşü Bağla (Esc)")}
              title="Esc"
            >
              <X size={20} />
            </button>
          </div>
        </header>

        {/* 3D WebGL Canvas Viewport */}
        <div
          ref={containerRef}
          className="eb-inspector__viewport"
          title={copy(
            "Drag to rotate · Scroll to zoom · Right-click drag to pan",
            "Fırlatmaq üçün sürüşdürün · Yaxınlaşdırmaq üçün fırladın · Sürüşdürmək üçün sağ klikləyin",
          )}
        />

        {/* Floating Controls HUD */}
        <footer className="eb-inspector__hud">
          {/* Material finishes */}
          <div
            className="eb-inspector__pill-group"
            role="group"
            aria-label={copy("Surface finish", "Səth örtüyü")}
          >
            <span className="eb-inspector__pill-label">
              <Palette size={13} />
              {copy("Finish", "Örtük")}:
            </span>
            <button
              type="button"
              className={`eb-inspector__pill-btn ${activeMaterial === "gold" ? "is-active" : ""}`}
              onClick={() => setActiveMaterial("gold")}
            >
              <span className="eb-swatch eb-swatch--gold" />
              {copy("Imperial Gold", "Qızıl")}
            </button>
            <button
              type="button"
              className={`eb-inspector__pill-btn ${activeMaterial === "platinum" ? "is-active" : ""}`}
              onClick={() => setActiveMaterial("platinum")}
            >
              <span className="eb-swatch eb-swatch--platinum" />
              {copy("Platinum", "Platin")}
            </button>
            <button
              type="button"
              className={`eb-inspector__pill-btn ${activeMaterial === "obsidian" ? "is-active" : ""}`}
              onClick={() => setActiveMaterial("obsidian")}
            >
              <span className="eb-swatch eb-swatch--obsidian" />
              {copy("Obsidian", "Obsidian")}
            </button>
            <button
              type="button"
              className={`eb-inspector__pill-btn ${activeMaterial === "hologram" ? "is-active" : ""}`}
              onClick={() => setActiveMaterial("hologram")}
            >
              <span className="eb-swatch eb-swatch--hologram" />
              {copy("Holo Wireframe", "Holo")}
            </button>
          </div>

          {/* Quick Tools */}
          <div className="eb-inspector__tools" role="toolbar" aria-label={copy("Inspection tools", "Təftiş alətləri")}>
            <button
              type="button"
              className={`eb-inspector__tool-btn ${autoRotate ? "is-active" : ""}`}
              onClick={() => setAutoRotate((prev) => !prev)}
              title={copy("Toggle Turntable Auto-Spin (Space)", "Avto-fırlanmanı dəyiş (Space)")}
            >
              {autoRotate ? <Pause size={15} /> : <Play size={15} />}
              <span>{autoRotate ? copy("Pause Spin", "Dayandır") : copy("Auto Spin", "Fırla")}</span>
            </button>

            {activeMaterial !== "hologram" && (
              <button
                type="button"
                className={`eb-inspector__tool-btn ${showWireframe ? "is-active" : ""}`}
                onClick={() => setShowWireframe((prev) => !prev)}
                title={copy("Toggle Wireframe Overlay", "Tor görünüşü")}
              >
                <Layers size={15} />
                <span>{copy("Wireframe", "Tor")}</span>
              </button>
            )}

            <button
              type="button"
              className="eb-inspector__tool-btn"
              onClick={resetCamera}
              title={copy("Reset View Angle (R)", "Görünüşü Sıfırla (R)")}
            >
              <RotateCcw size={15} />
              <span>{copy("Reset", "Sıfırla")}</span>
            </button>
          </div>

          <div className="eb-inspector__hint" aria-hidden="true">
            <span>{copy("🖱️ Drag: Rotate 360°", "🖱️ Sürüşdür: 360° Fırla")}</span>
            <span>·</span>
            <span>{copy("📜 Scroll: Zoom", "📜 Təkər: Zoom")}</span>
            <span>·</span>
            <span>{copy("⌨️ R: Reset", "⌨️ R: Sıfırla")}</span>
          </div>
        </footer>

        {/* Info Drawer Modal */}
        {showInfo && (
          <aside className="eb-inspector__info-card">
            <div className="eb-inspector__info-header">
              <h3>{copy("Expressbank Brand Spec", "Expressbank Brend Spesifikasiyası")}</h3>
              <button
                type="button"
                onClick={() => setShowInfo(false)}
                aria-label={copy("Close info", "Məlumatı bağla")}
              >
                <X size={15} />
              </button>
            </div>
            <div className="eb-inspector__info-body">
              <div className="eb-inspector__stat-grid">
                <div className="eb-inspector__stat">
                  <span className="eb-inspector__stat-name">{copy("Entity", "Qurum")}</span>
                  <span className="eb-inspector__stat-val">Expressbank OJSC</span>
                </div>
                <div className="eb-inspector__stat">
                  <span className="eb-inspector__stat-name">{copy("Geometry", "Həndəsə")}</span>
                  <span className="eb-inspector__stat-val">SVG Spline Extrusion</span>
                </div>
                <div className="eb-inspector__stat">
                  <span className="eb-inspector__stat-name">{copy("Bevel Depth", "Faska Dərinliyi")}</span>
                  <span className="eb-inspector__stat-val">0.7mm Dual-tier</span>
                </div>
                <div className="eb-inspector__stat">
                  <span className="eb-inspector__stat-name">{copy("Curve Precision", "Əyri Dəqiqliyi")}</span>
                  <span className="eb-inspector__stat-val">48-segment Spline</span>
                </div>
              </div>
              <p className="eb-inspector__info-text">
                {copy(
                  "Authentic vector-extruded monument. Engineered with high-precision beveled margins and physical clearcoat lacquer to capture ambient environmental reflections.",
                  "Rəsmi vektor əsasında ekstruziya olunmuş 3D abidə. Ətraf mühitin parlaq əkslərini nümayiş etdirmək üçün yüksək dəqiqlikli faskalar və ikiqat lak örtüyü ilə modelləşdirilmişdir.",
                )}
              </p>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};

export default Expressbank3DInspector;
