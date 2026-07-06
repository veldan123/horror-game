// On-screen controls for phones/tablets: a movement joystick (bottom-left),
// JUMP and flashlight buttons (bottom-right), and touch-drag anywhere else
// to look around. Pushing the joystick to its edge sprints.
const LOOK_SENSITIVITY = 0.0045; // radians per pixel
const MAX_PITCH = 1.45;

export class TouchControls {
  constructor(player, camera) {
    this.player = player;
    this.camera = camera;

    this.ui = document.getElementById('touch-ui');
    this.stick = document.getElementById('joystick');
    this.knob = document.getElementById('joystick-knob');

    // Manual yaw/pitch since PointerLockControls doesn't run on mobile.
    camera.rotation.order = 'YXZ';
    this.yaw = camera.rotation.y;
    this.pitch = camera.rotation.x;

    this.stickTouchId = null;
    this.lookTouchId = null;
    this.lookLast = { x: 0, y: 0 };

    this._bindJoystick();
    this._bindLook();
    this._bindButtons();
  }

  show() {
    this.ui.classList.remove('hidden');
    // Re-read the camera in case spawn set a facing direction.
    this.yaw = this.camera.rotation.y;
    this.pitch = this.camera.rotation.x;
  }

  hide() {
    this.ui.classList.add('hidden');
  }

  _bindJoystick() {
    const radius = 55; // knob travel in px

    const setKnob = (dx, dy) => {
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };

    this.stick.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.stickTouchId !== null) return;
      this.stickTouchId = e.changedTouches[0].identifier;
    }, { passive: false });

    this.stick.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier !== this.stickTouchId) continue;
        const rect = this.stick.getBoundingClientRect();
        let dx = t.clientX - (rect.left + rect.width / 2);
        let dy = t.clientY - (rect.top + rect.height / 2);
        const len = Math.hypot(dx, dy);
        if (len > radius) { dx = (dx / len) * radius; dy = (dy / len) * radius; }
        setKnob(dx, dy);
        const nx = dx / radius, ny = dy / radius;
        this.player.mobileMove.set(nx, -ny); // screen-up = forward
        this.player.mobileSprint = Math.hypot(nx, ny) > 0.92;
      }
    }, { passive: false });

    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this.stickTouchId) continue;
        this.stickTouchId = null;
        setKnob(0, 0);
        this.player.mobileMove.set(0, 0);
        this.player.mobileSprint = false;
      }
    };
    this.stick.addEventListener('touchend', end);
    this.stick.addEventListener('touchcancel', end);
  }

  _bindLook() {
    // Any touch that doesn't start on the joystick or a button drives the camera.
    document.addEventListener('touchstart', (e) => {
      if (!this.player.mobile) return;
      if (e.target.closest('#touch-ui') || e.target.closest('.screen')) return;
      if (this.lookTouchId !== null) return;
      const t = e.changedTouches[0];
      this.lookTouchId = t.identifier;
      this.lookLast = { x: t.clientX, y: t.clientY };
    }, { passive: false });

    document.addEventListener('touchmove', (e) => {
      if (this.lookTouchId === null) return;
      for (const t of e.changedTouches) {
        if (t.identifier !== this.lookTouchId) continue;
        e.preventDefault();
        this.yaw -= (t.clientX - this.lookLast.x) * LOOK_SENSITIVITY;
        this.pitch -= (t.clientY - this.lookLast.y) * LOOK_SENSITIVITY;
        this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch));
        this.lookLast = { x: t.clientX, y: t.clientY };
        this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
      }
    }, { passive: false });

    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.lookTouchId) this.lookTouchId = null;
      }
    };
    document.addEventListener('touchend', end);
    document.addEventListener('touchcancel', end);
  }

  _bindButtons() {
    const bind = (id, action) => {
      const el = document.getElementById(id);
      el.addEventListener('touchstart', (e) => {
        e.preventDefault(); // keep it from also firing a click / starting a look-drag
        action();
      }, { passive: false });
    };
    bind('btn-jump', () => this.player.jump());
    bind('btn-flash', () => this.player.toggleFlashlight());
  }
}
