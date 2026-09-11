/**
 * Expressbank Cyber Shooter: IT Warfare (Krunker-Style 3D FPS)
 * Three.js WebGL 3D World Engine, Fast-Paced Movement Controller (Slide-Hopping),
 * Procedural First-Person Weapons, and Real-Time Operator Visuals.
 */

import * as THREE from "three";
import {
  ShooterRole,
  ShooterPlayer,
  WeaponId,
  Vector3D,
  ROLE_SPECS,
  WEAPON_SPECS,
  ARENA_BOUNDS,
  JUMP_PADS,
} from "../../../../shared/types/shooter.js";
import { cyberShooterAudio } from "./cyber-shooter-audio.js";

export interface ShooterInputState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  slide: boolean;
  fire: boolean;
  aimDownSights: boolean;
  reload: boolean;
  ability: boolean;
}

export interface DamageNumber {
  text: string;
  isHeadshot: boolean;
  pos: THREE.Vector3;
  life: number; // 0 to 1
  sprite: THREE.Sprite;
}

export class CyberShooterEngine {
  private container: HTMLElement;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;

  // Player state & physical attributes
  public playerPosition: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  public playerVelocity: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  public playerYaw: number = 0;
  public playerPitch: number = 0;
  public currentRole: ShooterRole = "infosec";
  public activeWeapon: WeaponId = "railgun";

  // Movement physics flags
  public isGrounded: boolean = true;
  public isSliding: boolean = false;
  public slideTimer: number = 0;
  public canDoubleJump: boolean = false;
  public hasDoubleJumped: boolean = false;
  public cameraEyeHeight: number = 1.6;
  public targetEyeHeight: number = 1.6;

  // Weapon recoil & ADS animation
  private weaponHolder: THREE.Group;
  private weaponMesh: THREE.Group | null = null;
  private recoilOffset: THREE.Vector3 = new THREE.Vector3();
  private recoilRot: THREE.Euler = new THREE.Euler();
  private swayOffset: THREE.Vector3 = new THREE.Vector3();
  public isAimingDownSights: boolean = false;
  private baseFov: number = 85;
  private targetFov: number = 85;

  // World elements
  private remotePlayerMeshes: Map<string, THREE.Group> = new Map();
  private damageNumbers: DamageNumber[] = [];
  private laserTracers: { mesh: THREE.Line; life: number }[] = [];
  private animatedLights: THREE.PointLight[] = [];
  private jumpPadMeshes: THREE.Mesh[] = [];

  // Mouse sensitivity
  public mouseSensitivity: number = 0.0022;

  // Collision boxes for obstacles (server racks)
  private obstacleBoxes: THREE.Box3[] = [];

  constructor(container: HTMLElement) {
    this.container = container;

    // 1. Scene & Atmosphere
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060913);
    this.scene.fog = new THREE.FogExp2(0x060913, 0.022);

    // 2. Camera & Viewport
    const initW = container.clientWidth > 0 ? container.clientWidth : (typeof window !== "undefined" ? window.innerWidth : 800);
    const initH = container.clientHeight > 0 ? container.clientHeight : (typeof window !== "undefined" ? window.innerHeight : 600);

    this.camera = new THREE.PerspectiveCamera(
      this.baseFov,
      initW / initH,
      0.1,
      150
    );
    this.camera.rotation.order = "YXZ";
    this.scene.add(this.camera);

    // 3. Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setSize(initW, initH);
    this.renderer.setPixelRatio(typeof window !== "undefined" ? Math.min(window.devicePixelRatio, 2) : 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    container.appendChild(this.renderer.domElement);

    // 4. Weapon container anchored to camera
    this.weaponHolder = new THREE.Group();
    this.camera.add(this.weaponHolder);

    // 5. Construct Environment
    this.buildLighting();
    this.buildDatacenterArena();
    this.buildFirstPersonWeapon();

    window.addEventListener("resize", this.handleResize);
  }

  private handleResize = (): void => {
    if (!this.container || !this.renderer || !this.camera) return;
    const w = this.container.clientWidth > 0 ? this.container.clientWidth : (typeof window !== "undefined" ? window.innerWidth : 800);
    const h = this.container.clientHeight > 0 ? this.container.clientHeight : (typeof window !== "undefined" ? window.innerHeight : 600);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  /**
   * Ambient, Directional and Neon Spotlights
   */
  private buildLighting(): void {
    const ambient = new THREE.AmbientLight(0x1a2638, 0.9);
    this.scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0x00e5ff, 0.6);
    dirLight.position.set(10, 25, 10);
    this.scene.add(dirLight);

    // Expressbank golden vault overhead lamp
    const goldLamp = new THREE.PointLight(0xffb800, 2.0, 35);
    goldLamp.position.set(0, 10, -22);
    this.scene.add(goldLamp);
    this.animatedLights.push(goldLamp);

    // Cyber green SOC spotlight
    const greenSpot = new THREE.PointLight(0x00f576, 1.8, 30);
    greenSpot.position.set(-18, 8, -18);
    this.scene.add(greenSpot);
    this.animatedLights.push(greenSpot);

    // Cyan central core light
    const coreLight = new THREE.PointLight(0x00e5ff, 2.5, 40);
    coreLight.position.set(0, 8, 0);
    this.scene.add(coreLight);
    this.animatedLights.push(coreLight);
  }

  /**
   * Procedural Datacenter & Server Vault Arena
   */
  private buildDatacenterArena(): void {
    // 1. Grid Floor
    const floorGeo = new THREE.PlaneGeometry(60, 60, 30, 30);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x090e1a,
      roughness: 0.35,
      metalness: 0.8,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    this.scene.add(floor);

    // Grid floor lines overlay
    const gridHelper = new THREE.GridHelper(60, 60, 0x00e5ff, 0x112233);
    gridHelper.position.y = 0.02;
    this.scene.add(gridHelper);

    // 2. Perimeter Boundary Walls
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x0b1326,
      roughness: 0.5,
      metalness: 0.7,
    });

    const createWall = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      const mesh = new THREE.Mesh(geo, wallMat);
      mesh.position.set(x, y, z);
      this.scene.add(mesh);
      this.obstacleBoxes.push(new THREE.Box3().setFromObject(mesh));
    };

    createWall(60, 14, 2, 0, 7, -30); // North Wall
    createWall(60, 14, 2, 0, 7, 30);  // South Wall
    createWall(2, 14, 60, -30, 7, 0); // West Wall
    createWall(2, 14, 60, 30, 7, 0);  // East Wall

    // 3. Central Cyber Core & Server Racks
    this.createServerRackCluster(-16, -16);
    this.createServerRackCluster(16, -16);
    this.createServerRackCluster(-16, 16);
    this.createServerRackCluster(16, 16);

    // 4. Upper Catwalk Gantries (y = 5.5m)
    this.createCatwalk(0, 5.5, 0, 12, 12);
    this.createCatwalk(-18, 5.5, 0, 8, 18);
    this.createCatwalk(18, 5.5, 0, 8, 18);

    // Connecting Ramps
    this.createRamp(0, 2.75, 10, 4, 12, -0.45);
    this.createRamp(0, 2.75, -10, 4, 12, 0.45);

    // 5. Jump Pads
    for (const pad of JUMP_PADS) {
      const padGeo = new THREE.CylinderGeometry(1.6, 1.8, 0.25, 16);
      const padMat = new THREE.MeshStandardMaterial({
        color: 0x00f576,
        emissive: 0x00f576,
        emissiveIntensity: 0.8,
        metalness: 0.9,
      });
      const padMesh = new THREE.Mesh(padGeo, padMat);
      padMesh.position.set(pad.x, 0.12, pad.z);
      this.scene.add(padMesh);
      this.jumpPadMeshes.push(padMesh);

      // Outer glowing ring
      const ringGeo = new THREE.RingGeometry(1.9, 2.2, 24);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(pad.x, 0.15, pad.z);
      this.scene.add(ring);
    }

    // 6. Central Expressbank Hologram Monogram in sky
    const logoGroup = new THREE.Group();
    const logoRingGeo = new THREE.TorusGeometry(3.5, 0.18, 16, 48);
    const logoRingMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, wireframe: true });
    const logoRing = new THREE.Mesh(logoRingGeo, logoRingMat);
    logoGroup.add(logoRing);
    logoGroup.position.set(0, 11, 0);
    this.scene.add(logoGroup);
  }

  /**
   * Server Rack cluster with blinking status LEDs
   */
  private createServerRackCluster(cx: number, cz: number): void {
    const rackMat = new THREE.MeshStandardMaterial({ color: 0x131d2e, roughness: 0.4, metalness: 0.85 });
    const ledGreenMat = new THREE.MeshBasicMaterial({ color: 0x00f576 });
    const ledCyanMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff });
    const ledAmberMat = new THREE.MeshBasicMaterial({ color: 0xffb800 });

    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        if (i === 0 && j === 0) continue; // Hollow corridor in center
        const x = cx + i * 2.8;
        const z = cz + j * 2.8;

        const rackGeo = new THREE.BoxGeometry(1.8, 5.0, 1.4);
        const rackMesh = new THREE.Mesh(rackGeo, rackMat);
        rackMesh.position.set(x, 2.5, z);
        this.scene.add(rackMesh);
        this.obstacleBoxes.push(new THREE.Box3().setFromObject(rackMesh));

        // LED indicators on rack face
        for (let l = 0; l < 4; l++) {
          const ledMat = l % 3 === 0 ? ledGreenMat : l % 3 === 1 ? ledCyanMat : ledAmberMat;
          const ledGeo = new THREE.BoxGeometry(0.1, 0.08, 0.05);
          const led = new THREE.Mesh(ledGeo, ledMat);
          led.position.set(x - 0.4 + (l % 2) * 0.8, 1.2 + l * 0.8, z + 0.72);
          this.scene.add(led);
        }
      }
    }
  }

  private createCatwalk(x: number, y: number, z: number, w: number, d: number): void {
    const geo = new THREE.BoxGeometry(w, 0.4, d);
    const mat = new THREE.MeshStandardMaterial({ color: 0x17243b, metalness: 0.85, roughness: 0.3 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    this.scene.add(mesh);

    // Neon edge rails
    const railMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff });
    const railGeo = new THREE.BoxGeometry(w, 0.1, 0.1);
    const rail1 = new THREE.Mesh(railGeo, railMat);
    rail1.position.set(x, y + 0.25, z + d / 2);
    this.scene.add(rail1);
    const rail2 = new THREE.Mesh(railGeo, railMat);
    rail2.position.set(x, y + 0.25, z - d / 2);
    this.scene.add(rail2);
  }

  private createRamp(x: number, y: number, z: number, w: number, l: number, rotX: number): void {
    const geo = new THREE.BoxGeometry(w, 0.3, l);
    const mat = new THREE.MeshStandardMaterial({ color: 0x1a2942, metalness: 0.8 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.x = rotX;
    this.scene.add(mesh);
  }

  /**
   * Procedural First-Person Hands & Weapon Models
   */
  public buildFirstPersonWeapon(): void {
    if (this.weaponMesh) {
      this.weaponHolder.remove(this.weaponMesh);
    }

    const group = new THREE.Group();
    const weaponSpec = WEAPON_SPECS[this.activeWeapon];
    const accentColor = new THREE.Color(weaponSpec.accentColor);

    if (this.activeWeapon === "railgun") {
      // Sleek sniper chassis
      const bodyGeo = new THREE.BoxGeometry(0.14, 0.18, 1.1);
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x111928, roughness: 0.2, metalness: 0.9 });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.set(0, 0, -0.3);
      group.add(body);

      // High voltage coils
      for (let i = 0; i < 4; i++) {
        const coilGeo = new THREE.TorusGeometry(0.12, 0.02, 8, 16);
        const coilMat = new THREE.MeshStandardMaterial({ color: accentColor, emissive: accentColor, emissiveIntensity: 0.9 });
        const coil = new THREE.Mesh(coilGeo, coilMat);
        coil.position.set(0, 0, -0.15 - i * 0.2);
        group.add(coil);
      }

      // Sniper Holographic Scope
      const scopeGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.35, 12);
      const scopeMat = new THREE.MeshStandardMaterial({ color: 0x1f2a3d, metalness: 0.8 });
      const scope = new THREE.Mesh(scopeGeo, scopeMat);
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0, 0.14, -0.2);
      group.add(scope);

    } else if (this.activeWeapon === "ticket_gatling") {
      // Gatling blocky receiver
      const recGeo = new THREE.BoxGeometry(0.18, 0.22, 0.6);
      const recMat = new THREE.MeshStandardMaterial({ color: 0x152238, metalness: 0.85 });
      const receiver = new THREE.Mesh(recGeo, recMat);
      receiver.position.set(0, 0, -0.1);
      group.add(receiver);

      // Rotating multi-barrels
      for (let b = 0; b < 4; b++) {
        const angle = (b * Math.PI) / 2;
        const barGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.55, 8);
        const barMat = new THREE.MeshStandardMaterial({ color: 0x22334d, metalness: 0.95 });
        const barrel = new THREE.Mesh(barGeo, barMat);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(Math.cos(angle) * 0.06, Math.sin(angle) * 0.06, -0.55);
        group.add(barrel);
      }

      // Drum magazine
      const drumGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.14, 16);
      const drumMat = new THREE.MeshStandardMaterial({ color: accentColor, emissive: accentColor, emissiveIntensity: 0.4 });
      const drum = new THREE.Mesh(drumGeo, drumMat);
      drum.position.set(0, -0.18, -0.1);
      group.add(drum);

    } else {
      // Server Rack Flak Shotgun: Heavy dual barrels
      const recGeo = new THREE.BoxGeometry(0.22, 0.24, 0.65);
      const recMat = new THREE.MeshStandardMaterial({ color: 0x261a0f, metalness: 0.8 });
      const receiver = new THREE.Mesh(recGeo, recMat);
      receiver.position.set(0, 0, -0.1);
      group.add(receiver);

      // Twin heavy barrels
      [-0.055, 0.055].forEach((bx) => {
        const barGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.65, 12);
        const barMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.9 });
        const barrel = new THREE.Mesh(barGeo, barMat);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(bx, 0.04, -0.55);
        group.add(barrel);
      });

      // Heavy pump slider
      const pumpGeo = new THREE.BoxGeometry(0.16, 0.12, 0.25);
      const pumpMat = new THREE.MeshStandardMaterial({ color: 0xffb800, roughness: 0.3 });
      const pump = new THREE.Mesh(pumpGeo, pumpMat);
      pump.position.set(0, -0.06, -0.42);
      group.add(pump);
    }

    // Default hip-fire weapon placement (down & right)
    group.position.set(0.32, -0.28, -0.55);
    this.weaponMesh = group;
    this.weaponHolder.add(group);
  }

  /**
   * Handle Mouse Look from Pointer Lock delta
   */
  public onMouseMove(dx: number, dy: number): void {
    const sens = this.isAimingDownSights ? this.mouseSensitivity * 0.5 : this.mouseSensitivity;
    this.playerYaw -= dx * sens;
    this.playerPitch -= dy * sens;

    // Clamp pitch to prevent camera flip [-85°, 85°]
    const maxPitch = (85 * Math.PI) / 180;
    this.playerPitch = Math.max(-maxPitch, Math.min(maxPitch, this.playerPitch));
  }

  /**
   * Update Player Physics & Krunker Movement (Slide-Hopping)
   */
  public updatePlayerPhysics(input: ShooterInputState, dt: number): void {
    const roleSpec = ROLE_SPECS[this.currentRole];
    const baseSpeed = 12.0 * roleSpec.speedMultiplier;

    // Camera height adjustment (crouch / slide)
    if (input.slide) {
      this.targetEyeHeight = 0.95;
    } else {
      this.targetEyeHeight = 1.6;
    }
    this.cameraEyeHeight += (this.targetEyeHeight - this.cameraEyeHeight) * Math.min(1, dt * 14);

    // Direction vector from Yaw
    const forwardX = -Math.sin(this.playerYaw);
    const forwardZ = -Math.cos(this.playerYaw);
    const rightX = Math.cos(this.playerYaw);
    const rightZ = -Math.sin(this.playerYaw);

    let moveX = 0;
    let moveZ = 0;
    if (input.forward) { moveX += forwardX; moveZ += forwardZ; }
    if (input.backward) { moveX -= forwardX; moveZ -= forwardZ; }
    if (input.left) { moveX -= rightX; moveZ -= rightZ; }
    if (input.right) { moveX += rightX; moveZ += rightZ; }

    const inputLen = Math.hypot(moveX, moveZ);
    if (inputLen > 0.001) {
      moveX /= inputLen;
      moveZ /= inputLen;
    }

    // 1. Sliding & Slide-Hopping Logic (Iconic Krunker Mechanic)
    if (input.slide && this.isGrounded) {
      if (!this.isSliding) {
        this.isSliding = true;
        this.slideTimer = 0.65;
        cyberShooterAudio.playSlideSound();

        // Slide boost forward
        const currentSpeed = Math.hypot(this.playerVelocity.x, this.playerVelocity.z);
        const boostSpeed = Math.max(currentSpeed * 1.25, baseSpeed * 1.4);
        if (inputLen > 0.1) {
          this.playerVelocity.x = moveX * boostSpeed;
          this.playerVelocity.z = moveZ * boostSpeed;
        }
      } else {
        this.slideTimer -= dt;
        // Friction during slide is low to allow slide-hop momentum!
        this.playerVelocity.x *= Math.pow(0.96, dt * 60);
        this.playerVelocity.z *= Math.pow(0.96, dt * 60);
        if (this.slideTimer <= 0) {
          this.isSliding = false;
        }
      }
    } else {
      this.isSliding = false;
    }

    // 2. Ground Movement & Air Strafe
    if (this.isGrounded && !this.isSliding) {
      const targetVx = moveX * baseSpeed;
      const targetVz = moveZ * baseSpeed;
      const accel = 18.0;
      this.playerVelocity.x += (targetVx - this.playerVelocity.x) * Math.min(1, dt * accel);
      this.playerVelocity.z += (targetVz - this.playerVelocity.z) * Math.min(1, dt * accel);
      this.canDoubleJump = this.currentRole === "helpdesk";
      this.hasDoubleJumped = false;
    } else if (!this.isGrounded) {
      // Air strafing acceleration
      const airAccel = 8.0;
      this.playerVelocity.x += moveX * airAccel * dt;
      this.playerVelocity.z += moveZ * airAccel * dt;
    }

    // 3. Jump & Double Jump
    if (input.jump) {
      if (this.isGrounded) {
        this.isGrounded = false;
        const jumpVel = 9.5 * roleSpec.jumpMultiplier;
        this.playerVelocity.y = jumpVel;
        cyberShooterAudio.playJumpSound();

        // If jumping out of a slide: SLIDE-HOP BOOST!
        if (this.isSliding) {
          this.playerVelocity.x *= 1.15;
          this.playerVelocity.z *= 1.15;
          this.isSliding = false;
        }
      } else if (this.canDoubleJump && !this.hasDoubleJumped) {
        // Help Desk Double Jump
        this.hasDoubleJumped = true;
        this.playerVelocity.y = 8.5;
        cyberShooterAudio.playJumpSound();
      }
    }

    // 4. Gravity
    this.playerVelocity.y -= 26.0 * dt;

    // 5. Jump Pads Collision
    for (const pad of JUMP_PADS) {
      const d = Math.hypot(pad.x - this.playerPosition.x, pad.z - this.playerPosition.z);
      if (d < 1.7 && this.playerPosition.y <= 0.4) {
        this.playerVelocity.y = pad.boostY;
        if (pad.boostHoriz) {
          this.playerVelocity.x = pad.boostHoriz.x;
          this.playerVelocity.z = pad.boostHoriz.z;
        }
        this.isGrounded = false;
        cyberShooterAudio.playJumpPadLaunch();
        break;
      }
    }

    // 6. Integrate Position
    this.playerPosition.x += this.playerVelocity.x * dt;
    this.playerPosition.y += this.playerVelocity.y * dt;
    this.playerPosition.z += this.playerVelocity.z * dt;

    // 7. Floor and Boundaries Collision
    if (this.playerPosition.y <= 0) {
      this.playerPosition.y = 0;
      this.playerVelocity.y = 0;
      this.isGrounded = true;
    }

    this.playerPosition.x = Math.max(ARENA_BOUNDS.minX, Math.min(ARENA_BOUNDS.maxX, this.playerPosition.x));
    this.playerPosition.z = Math.max(ARENA_BOUNDS.minZ, Math.min(ARENA_BOUNDS.maxZ, this.playerPosition.z));

    // 8. Update Camera Position & Rotation
    this.camera.position.set(
      this.playerPosition.x,
      this.playerPosition.y + this.cameraEyeHeight,
      this.playerPosition.z
    );
    this.camera.rotation.set(this.playerPitch, this.playerYaw, 0, "YXZ");

    // 9. Weapon Sway & Recoil Recovery
    this.updateWeaponAnimation(input, dt);

    // 10. Update Damage Numbers & Laser Tracers
    this.updateDamageNumbers(dt);
    this.updateLaserTracers(dt);
  }

  /**
   * Weapon ADS and Recoil Kick
   */
  private updateWeaponAnimation(input: ShooterInputState, dt: number): void {
    if (!this.weaponMesh) return;

    this.isAimingDownSights = input.aimDownSights;
    const spec = WEAPON_SPECS[this.activeWeapon];

    // FOV Zoom for ADS
    if (this.isAimingDownSights) {
      const zoomMult = spec.zoomFovMultiplier || 0.8;
      this.targetFov = this.baseFov * zoomMult;
    } else {
      this.targetFov = this.baseFov;
    }
    this.camera.fov += (this.targetFov - this.camera.fov) * Math.min(1, dt * 16);
    this.camera.updateProjectionMatrix();

    // Weapon Position Lerp (Hip-fire vs Center ADS)
    const targetPos = this.isAimingDownSights
      ? new THREE.Vector3(0, -0.15, -0.4) // Centered for sights
      : new THREE.Vector3(0.32, -0.28, -0.55); // Down right

    // Add walking bobbing sway
    const horizSpeed = Math.hypot(this.playerVelocity.x, this.playerVelocity.z);
    if (this.isGrounded && horizSpeed > 1.0) {
      const bobTime = Date.now() * 0.008;
      targetPos.x += Math.sin(bobTime) * 0.015;
      targetPos.y += Math.abs(Math.cos(bobTime)) * 0.018;
    }

    // Smooth position & recover recoil
    this.recoilOffset.lerp(new THREE.Vector3(), dt * 10);
    this.recoilRot.x += (0 - this.recoilRot.x) * dt * 12;

    this.weaponMesh.position.lerp(targetPos.clone().add(this.recoilOffset), dt * 16);
    this.weaponMesh.rotation.x = this.recoilRot.x;
  }

  /**
   * Apply Visual Recoil Kick on Fire
   */
  public applyFireRecoil(): void {
    const spec = WEAPON_SPECS[this.activeWeapon];
    const kick = spec.recoilKick;
    this.recoilOffset.z += kick * 1.5;
    this.recoilOffset.y += kick * 0.5;
    this.recoilRot.x += kick * 1.2;
  }

  /**
   * Spawn 3D Laser Tracer Line in World
   */
  public spawnLaserTracer(origin: THREE.Vector3, target: THREE.Vector3, colorHex: number = 0x00f576): void {
    const points = [origin, target];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: colorHex, linewidth: 2 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.laserTracers.push({ mesh: line, life: 0.22 });
  }

  private updateLaserTracers(dt: number): void {
    for (let i = this.laserTracers.length - 1; i >= 0; i--) {
      const tracer = this.laserTracers[i];
      tracer.life -= dt;
      if (tracer.life <= 0) {
        this.scene.remove(tracer.mesh);
        this.laserTracers.splice(i, 1);
      }
    }
  }

  /**
   * Spawn 3D Floating Damage Number
   */
  public spawnDamageNumber(pos: THREE.Vector3, amount: number, isHeadshot: boolean): void {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.font = isHeadshot ? "bold 38px Inter, sans-serif" : "bold 30px Inter, sans-serif";
    ctx.fillStyle = isHeadshot ? "#ff3366" : "#ffcc00";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = isHeadshot ? "rgba(255, 51, 102, 0.8)" : "rgba(255, 204, 0, 0.8)";
    ctx.shadowBlur = 8;
    ctx.fillText(`${amount}${isHeadshot ? " CRIT!" : ""}`, 64, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.5, 0.75, 1);
    sprite.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 1.8, (Math.random() - 0.5) * 0.6));

    this.scene.add(sprite);
    this.damageNumbers.push({ text: `${amount}`, isHeadshot, pos: sprite.position, life: 1.0, sprite });
  }

  private updateDamageNumbers(dt: number): void {
    for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
      const dn = this.damageNumbers[i];
      dn.life -= dt * 1.4;
      dn.pos.y += dt * 1.5;
      dn.sprite.material.opacity = Math.max(0, dn.life);

      if (dn.life <= 0) {
        this.scene.remove(dn.sprite);
        this.damageNumbers.splice(i, 1);
      }
    }
  }

  /**
   * Sync Remote Players & AI Bots Meshes in the 3D Scene
   */
  public updateRemotePlayers(players: Record<string, ShooterPlayer>, localPlayerId: string): void {
    const activeIds = new Set<string>();

    for (const [pId, p] of Object.entries(players)) {
      if (pId === localPlayerId) continue;
      activeIds.add(pId);

      let group = this.remotePlayerMeshes.get(pId);
      if (!group) {
        group = this.buildRemotePlayerModel(p.role, p.name);
        this.scene.add(group);
        this.remotePlayerMeshes.set(pId, group);
      }

      // Smooth position interpolation
      group.position.lerp(new THREE.Vector3(p.position.x, p.position.y, p.position.z), 0.35);
      group.rotation.y = p.yaw;
      group.visible = p.health > 0;
    }

    // Remove disconnected players
    for (const [pId, group] of this.remotePlayerMeshes.entries()) {
      if (!activeIds.has(pId)) {
        this.scene.remove(group);
        this.remotePlayerMeshes.delete(pId);
      }
    }
  }

  /**
   * Build 3D Low-Poly Operator Model for Remote Player / AI Bot
   */
  private buildRemotePlayerModel(role: ShooterRole, name: string): THREE.Group {
    const group = new THREE.Group();
    const roleSpec = ROLE_SPECS[role];
    const roleColor = new THREE.Color(roleSpec.color);

    // Torso Armor
    const torsoGeo = new THREE.BoxGeometry(0.7, 0.9, 0.45);
    const torsoMat = new THREE.MeshStandardMaterial({ color: 0x1a2638, roughness: 0.4, metalness: 0.8 });
    const torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.y = 1.05;
    group.add(torso);

    // Chest Emblem with Role Color
    const emblemGeo = new THREE.BoxGeometry(0.35, 0.35, 0.05);
    const emblemMat = new THREE.MeshBasicMaterial({ color: roleColor });
    const emblem = new THREE.Mesh(emblemGeo, emblemMat);
    emblem.position.set(0, 1.15, 0.24);
    group.add(emblem);

    // Head / Helmet
    const headGeo = new THREE.BoxGeometry(0.42, 0.45, 0.42);
    const headMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.75;
    group.add(head);

    // Glowing Visor
    const visorGeo = new THREE.BoxGeometry(0.32, 0.12, 0.05);
    const visorMat = new THREE.MeshBasicMaterial({ color: roleColor });
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 1.76, 0.22);
    group.add(visor);

    // Legs
    const legMat = new THREE.MeshStandardMaterial({ color: 0x0b1120, roughness: 0.6 });
    [-0.18, 0.18].forEach((lx) => {
      const legGeo = new THREE.BoxGeometry(0.24, 0.75, 0.24);
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(lx, 0.38, 0);
      group.add(leg);
    });

    // Weapon in hand
    const gunGeo = new THREE.BoxGeometry(0.1, 0.12, 0.65);
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x223344, metalness: 0.9 });
    const gun = new THREE.Mesh(gunGeo, gunMat);
    gun.position.set(0.42, 1.0, 0.25);
    group.add(gun);

    // Overhead Nameplate Sprite
    const nameCanvas = document.createElement("canvas");
    nameCanvas.width = 256;
    nameCanvas.height = 64;
    const nameCtx = nameCanvas.getContext("2d");
    if (nameCtx) {
      nameCtx.font = "bold 24px Inter, sans-serif";
      nameCtx.fillStyle = roleSpec.color;
      nameCtx.textAlign = "center";
      nameCtx.fillText(name, 128, 30);
      nameCtx.font = "16px Inter, sans-serif";
      nameCtx.fillStyle = "#88a0c0";
      nameCtx.fillText(`[${roleSpec.callsign}]`, 128, 52);
    }
    const nameTex = new THREE.CanvasTexture(nameCanvas);
    const nameMat = new THREE.SpriteMaterial({ map: nameTex, transparent: true });
    const nameSprite = new THREE.Sprite(nameMat);
    nameSprite.scale.set(2.0, 0.5, 1);
    nameSprite.position.set(0, 2.35, 0);
    group.add(nameSprite);

    return group;
  }

  /**
   * Main Render Loop Frame
   */
  public render(): void {
    // Pulse animated lights slightly
    const time = Date.now() * 0.003;
    this.animatedLights.forEach((light, i) => {
      light.intensity = 1.6 + Math.sin(time + i * 1.5) * 0.4;
    });

    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Clean up resources
   */
  public dispose(): void {
    window.removeEventListener("resize", this.handleResize);
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}
