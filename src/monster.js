import * as THREE from 'three';
import { findPath, randomWalkableCell, worldToCell, cellToWorld } from './map.js';

const PATROL_SPEED = 1.7;
const CHASE_SPEED = 4.4;      // faster than walking (3.2), slower than sprinting (5.0)
const SIGHT_RANGE = 9;        // meters
const SIGHT_RANGE_FLASHLIGHT = 15; // your light gives you away
const SIGHT_HALF_ANGLE = THREE.MathUtils.degToRad(75);
const PROXIMITY_RANGE = 2.4;  // hears you this close, no line of sight needed
const CATCH_DISTANCE = 1.15;
const LOSE_SIGHT_SECONDS = 4.5;

export class Monster {
  /**
   * @param scene       three.js scene
   * @param walkable    grid from parseMap()
   * @param spawnCell   {col,row}
   * @param wallMeshes  meshes that block line of sight
   * @param audio       HorrorAudio
   * @param onCatch     called once when the player is caught
   */
  constructor(scene, walkable, spawnCell, wallMeshes, audio, onCatch) {
    this.walkable = walkable;
    this.wallMeshes = wallMeshes;
    this.audio = audio;
    this.onCatch = onCatch;

    this.state = 'patrol';
    this.path = [];
    this.repathTimer = 0;
    this.lastSeenTime = -Infinity;
    this.stepTimer = 0;
    this.waitTimer = 0;
    this.caught = false;
    this.chasePos = new THREE.Vector3(); // last known position of whoever it's hunting
    // Puppet mode (guest side): AI is off, position comes from the network.
    this._netPos = new THREE.Vector3();
    this._netYaw = 0;

    this.group = this._buildMesh();
    const { x, z } = cellToWorld(spawnCell.col, spawnCell.row);
    this.group.position.set(x, 0, z);
    scene.add(this.group);

    this._raycaster = new THREE.Raycaster();
  }

  _buildMesh() {
    const group = new THREE.Group();

    const skin = new THREE.MeshStandardMaterial({ color: 0x0c0c10, roughness: 1 });
    const pale = new THREE.MeshStandardMaterial({ color: 0xcfc4b2, roughness: 0.9 });

    // Tall gaunt body, a head taller than the player.
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 1.5, 4, 12), skin);
    body.position.y = 1.1;
    body.castShadow = true;
    group.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 16, 12), pale);
    head.position.y = 2.15;
    head.scale.set(0.85, 1.15, 0.9); // slightly elongated skull
    head.castShadow = true;
    group.add(head);
    this.head = head;

    // Glowing eyes — the first thing you see in the dark.
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: 0xff2a1a,
      emissiveIntensity: 4,
    });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), eyeMat);
      eye.position.set(side * 0.075, 2.18, -0.17);
      group.add(eye);
    }

    // Arms hanging too long.
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.3, 0.09), skin);
      arm.position.set(side * 0.42, 1.05, 0);
      arm.rotation.z = side * 0.08;
      arm.castShadow = true;
      group.add(arm);
    }

    return group;
  }

  get position() {
    return this.group.position;
  }

  _cell() {
    return worldToCell(this.position.x, this.position.z);
  }

  _canSeePlayer(playerPos, flashlightOn) {
    const eye = this.position.clone().setY(2.1);
    const toPlayer = playerPos.clone().sub(eye);
    const dist = toPlayer.length();

    if (dist < PROXIMITY_RANGE) return true;

    const range = flashlightOn ? SIGHT_RANGE_FLASHLIGHT : SIGHT_RANGE;
    if (dist > range) return false;

    // Facing check: monster only sees within its forward cone.
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.group.quaternion);
    toPlayer.normalize();
    if (forward.dot(toPlayer) < Math.cos(SIGHT_HALF_ANGLE)) return false;

    // Wall check.
    this._raycaster.set(eye, toPlayer);
    this._raycaster.far = dist;
    return this._raycaster.intersectObjects(this.wallMeshes, false).length === 0;
  }

  _setPathTo(cell) {
    const path = findPath(this.walkable, this._cell(), cell);
    this.path = path
      ? path.map(({ col, row }) => {
          const { x, z } = cellToWorld(col, row);
          return new THREE.Vector3(x, 0, z);
        })
      : [];
  }

  /**
   * Host/single-player AI tick.
   * @param targets array of {position: Vector3, flashlightOn: bool}.
   *   Index 0 must be the local player (used for heartbeat volume).
   */
  update(dt, targets, elapsed) {
    if (this.caught) return;

    // Find the nearest target it can currently see.
    let seenIdx = -1;
    let seenDist = Infinity;
    for (let i = 0; i < targets.length; i++) {
      const d = this.position.distanceTo(targets[i].position);
      if (d < seenDist && this._canSeePlayer(targets[i].position, targets[i].flashlightOn)) {
        seenIdx = i;
        seenDist = d;
      }
    }
    const seesPlayer = seenIdx >= 0;
    if (seesPlayer) {
      this.lastSeenTime = elapsed;
      this.chasePos.copy(targets[seenIdx].position);
    }
    const chaseDist = this.position.distanceTo(this.chasePos);
    const localDist = this.position.distanceTo(targets[0].position);

    // --- State transitions ---
    if (this.state === 'patrol' && seesPlayer) {
      this.state = 'chase';
      this.audio.scream();
      this.audio.startHeartbeat();
      this.repathTimer = 0;
    } else if (
      this.state === 'chase' &&
      elapsed - this.lastSeenTime > LOSE_SIGHT_SECONDS &&
      chaseDist > 7
    ) {
      this.state = 'patrol';
      this.path = [];
      this.waitTimer = 1.5; // stands still a moment, listening
      this.audio.stopHeartbeat();
    }

    // --- Movement ---
    let speed = 0;
    let target = null;

    if (this.state === 'chase') {
      speed = CHASE_SPEED;
      this.audio.setHeartbeatDistance(localDist);
      this.audio.chaseShriek();

      this.repathTimer -= dt;
      if (this.repathTimer <= 0) {
        this._setPathTo(worldToCell(this.chasePos.x, this.chasePos.z));
        this.repathTimer = 0.35;
      }
      // Close and visible: skip the grid, lunge straight at the player.
      if (seesPlayer && seenDist < 5) {
        target = this.chasePos.clone().setY(0);
      }
    } else {
      speed = PATROL_SPEED;
      this.waitTimer -= dt;
      if (this.path.length === 0 && this.waitTimer <= 0) {
        this._setPathTo(randomWalkableCell(this.walkable));
        this.waitTimer = 1 + Math.random() * 2; // pause at each destination
      }
    }

    if (!target && this.path.length > 0) {
      target = this.path[0];
    }

    if (target) {
      const to = target.clone().setY(0).sub(this.position.clone().setY(0));
      const stepLen = to.length();
      if (stepLen < 0.2) {
        if (this.path.length > 0 && target === this.path[0]) this.path.shift();
      } else {
        to.normalize();
        this.position.addScaledVector(to, Math.min(speed * dt, stepLen));

        // Face movement direction, smoothly.
        const targetQuat = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(0, Math.atan2(to.x, to.z) + Math.PI, 0)
        );
        this.group.quaternion.slerp(targetQuat, Math.min(dt * 8, 1));

        // Footsteps — the main way you hear it coming.
        this.stepTimer -= dt;
        if (this.stepTimer <= 0) {
          this.audio.monsterStep(localDist);
          this.stepTimer = this.state === 'chase' ? 0.28 : 0.5;
        }
      }
    }

    this._twitch();

    // --- Catch: any player within reach ---
    for (let i = 0; i < targets.length; i++) {
      if (this.position.distanceTo(targets[i].position) < CATCH_DISTANCE && !this.caught) {
        this.caught = true;
        this.audio.stopHeartbeat();
        this.onCatch(i);
        break;
      }
    }
  }

  _twitch() {
    // Constant unsettling head twitch.
    this.head.rotation.set(
      (Math.random() - 0.5) * 0.12,
      (Math.random() - 0.5) * 0.25,
      (Math.random() - 0.5) * 0.12
    );
  }

  // --- Puppet mode: on the guest, the host's simulation drives the monster ---

  /** Apply a network snapshot { p:[x,z], ry, st }. */
  applyNet(snap) {
    this._netPos.set(snap.p[0], 0, snap.p[1]);
    this._netYaw = snap.ry;
    if (snap.st === 'chase' && this.state !== 'chase') {
      this.audio.scream(); // the guest hears it spot someone too
    }
    this.state = snap.st;
  }

  /** Guest-side tick: interpolate, twitch, and thud footsteps by distance. */
  updatePuppet(dt, myPos) {
    const before = this.position.clone();
    this.position.lerp(this._netPos, Math.min(dt * 10, 1));

    let d = this._netYaw - this.group.rotation.y;
    d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    this.group.rotation.y += d * Math.min(dt * 8, 1);

    this._twitch();

    // Footsteps synthesized locally from how fast it's actually moving.
    if (before.distanceTo(this.position) > 0.015) {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.audio.monsterStep(this.position.distanceTo(myPos));
        this.stepTimer = this.state === 'chase' ? 0.28 : 0.5;
      }
    }
  }

  /** Network snapshot of the monster for the guest. */
  serialize() {
    const yaw = new THREE.Euler().setFromQuaternion(this.group.quaternion, 'YXZ').y;
    return { p: [this.position.x, this.position.z], ry: yaw, st: this.state };
  }
}
