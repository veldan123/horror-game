import * as THREE from 'three';

/**
 * The other player's body in your world. Receives network state
 * ~20 times a second and smoothly interpolates between updates.
 */
export class RemotePlayer {
  constructor(scene) {
    this.group = new THREE.Group();

    // Clearly human — cool blue-grey so it never reads as the monster.
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a4a66, roughness: 0.9 });
    const pale = new THREE.MeshStandardMaterial({ color: 0xd6c9b6, roughness: 0.9 });

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.95, 4, 12), bodyMat);
    body.position.y = 0.85;
    body.castShadow = true;
    this.group.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), pale);
    head.position.y = 1.62;
    head.castShadow = true;
    this.group.add(head);

    // Their flashlight, visible to you as a beam from their head.
    this.lamp = new THREE.SpotLight(0xfff2d9, 40, 16, Math.PI / 7, 0.4, 1.5);
    this.lamp.position.set(0, 1.55, -0.2);
    this.lamp.target.position.set(0, 1.2, -4);
    this.lamp.visible = false;
    this.group.add(this.lamp);
    this.group.add(this.lamp.target);

    this.group.visible = false; // hidden until the first state arrives
    scene.add(this.group);

    this.targetPos = new THREE.Vector3();
    this.targetYaw = 0;
    // Their camera position, used by the host's monster AI as a target.
    this.cameraPos = new THREE.Vector3(9999, 1.7, 9999);
    this.flashlightOn = false;
  }

  setState(p, yaw, flashlightOn) {
    this.cameraPos.set(p[0], p[1], p[2]);
    this.targetPos.set(p[0], 0, p[2]);
    this.targetYaw = yaw;
    this.flashlightOn = flashlightOn;
    this.lamp.visible = flashlightOn;
    if (!this.group.visible) {
      this.group.visible = true;
      this.group.position.copy(this.targetPos);
      this.group.rotation.y = yaw;
    }
  }

  hide() {
    this.group.visible = false;
    this.cameraPos.set(9999, 1.7, 9999);
  }

  update(dt) {
    if (!this.group.visible) return;
    this.group.position.lerp(this.targetPos, Math.min(dt * 12, 1));
    // Shortest-arc yaw interpolation.
    let d = this.targetYaw - this.group.rotation.y;
    d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    this.group.rotation.y += d * Math.min(dt * 10, 1);
  }
}
