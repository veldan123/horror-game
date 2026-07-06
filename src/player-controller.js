import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

const PLAYER_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.35;
const WALK_SPEED = 3.2; // m/s — deliberate, grounded pace
const RUN_SPEED = 5.0;  // hold Shift — slightly faster than the monster's chase

/**
 * First-person controller: WASD movement, pointer-lock mouse look,
 * AABB collision against the level's Box3 colliders, and a toggleable
 * flashlight (F) attached to the camera.
 */
export class PlayerController {
  constructor(camera, domElement, colliders) {
    this.camera = camera;
    this.colliders = colliders;

    this.controls = new PointerLockControls(camera, domElement);
    camera.position.set(0, PLAYER_HEIGHT, 3);

    this.velocity = new THREE.Vector3();
    this.keys = { forward: false, back: false, left: false, right: false, sprint: false };

    // --- Flashlight: spotlight + its target, both parented to the camera
    // so the beam always points where the player looks.
    this.flashlight = new THREE.SpotLight(
      0xfff2d9, // warm white
      80,       // intensity (physical units — needs to be high to punch through)
      18,       // range
      Math.PI / 7, // cone angle
      0.4,      // penumbra (soft edge)
      1.5       // decay
    );
    this.flashlight.castShadow = true;
    this.flashlight.shadow.mapSize.set(1024, 1024);
    this.flashlight.position.set(0.15, -0.2, 0.1); // slight offset, like hand-held
    this.flashlight.target.position.set(0, -0.1, -3);
    this.flashlight.visible = false;
    camera.add(this.flashlight);
    camera.add(this.flashlight.target);

    this._onKeyDown = (e) => this._setKey(e.code, true);
    this._onKeyUp = (e) => this._setKey(e.code, false);
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);

    this._playerBox = new THREE.Box3();
  }

  _setKey(code, pressed) {
    switch (code) {
      case 'KeyW': case 'ArrowUp': this.keys.forward = pressed; break;
      case 'KeyS': case 'ArrowDown': this.keys.back = pressed; break;
      case 'KeyA': case 'ArrowLeft': this.keys.left = pressed; break;
      case 'KeyD': case 'ArrowRight': this.keys.right = pressed; break;
      case 'ShiftLeft': case 'ShiftRight': this.keys.sprint = pressed; break;
      case 'KeyF':
        if (pressed && this.controls.isLocked) {
          this.flashlight.visible = !this.flashlight.visible;
        }
        break;
    }
  }

  lock() {
    this.controls.lock();
  }

  get isLocked() {
    return this.controls.isLocked;
  }

  /** Axis-aligned box around the player's current position. */
  _boxAt(pos) {
    this._playerBox.min.set(pos.x - PLAYER_RADIUS, 0.1, pos.z - PLAYER_RADIUS);
    this._playerBox.max.set(pos.x + PLAYER_RADIUS, PLAYER_HEIGHT, pos.z + PLAYER_RADIUS);
    return this._playerBox;
  }

  _collides(pos) {
    const box = this._boxAt(pos);
    for (const c of this.colliders) {
      if (box.intersectsBox(c)) return true;
    }
    return false;
  }

  update(dt) {
    if (!this.controls.isLocked) return;

    // Build the desired move direction in camera space (XZ only).
    const input = new THREE.Vector3(
      (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0),
      0,
      (this.keys.back ? 1 : 0) - (this.keys.forward ? 1 : 0)
    );

    const pos = this.camera.position;

    if (input.lengthSq() > 0) {
      input.normalize();

      // Rotate input by the camera's yaw so W is always "where I'm facing".
      const yaw = new THREE.Euler(0, 0, 0, 'YXZ');
      yaw.setFromQuaternion(this.camera.quaternion);
      const speed = this.keys.sprint ? RUN_SPEED : WALK_SPEED;
      const move = new THREE.Vector3(input.x, 0, input.z)
        .applyEuler(new THREE.Euler(0, yaw.y, 0))
        .multiplyScalar(speed * dt);

      // Try each axis independently so the player slides along walls
      // instead of sticking to them.
      const nextX = pos.clone();
      nextX.x += move.x;
      if (!this._collides(nextX)) pos.x = nextX.x;

      const nextZ = pos.clone();
      nextZ.z += move.z;
      if (!this._collides(nextZ)) pos.z = nextZ.z;
    }

    // Lock the eye height (no jumping/crouching in Phase 1).
    pos.y = PLAYER_HEIGHT;
  }

  dispose() {
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    this.controls.dispose();
  }
}
