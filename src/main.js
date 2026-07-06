import * as THREE from 'three';
import { setupScene } from './scene-setup.js';
import { PlayerController } from './player-controller.js';
import { Monster } from './monster.js';
import { HorrorAudio } from './audio.js';
import { Network } from './network.js';
import { RemotePlayer } from './remote-player.js';
import { TouchControls } from './touch-controls.js';
import { cellToWorld, worldToCell } from './map.js';

const IS_TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

// --- DOM ---
const app = document.getElementById('app');
const overlay = document.getElementById('overlay');
const pauseScreen = document.getElementById('pause-screen');
const deathScreen = document.getElementById('death-screen');
const deathTitle = document.getElementById('death-title');
const winScreen = document.getElementById('win-screen');
const objectiveEl = document.getElementById('objective');
const messageEl = document.getElementById('message');
const redflash = document.getElementById('redflash');
const menu = document.getElementById('menu');
const hostPanel = document.getElementById('host-panel');
const joinPanel = document.getElementById('join-panel');
const pinDisplay = document.getElementById('pin-display');
const hostStatus = document.getElementById('host-status');
const joinStatus = document.getElementById('join-status');
const pinInput = document.getElementById('pin-input');

// --- Renderer ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
app.appendChild(renderer.domElement);

// --- Scene, player, monster, audio ---
const level = setupScene();
const audio = new HorrorAudio();

const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
level.scene.add(camera); // camera must be in the scene so the flashlight renders

const player = new PlayerController(camera, renderer.domElement, level.colliders);
const touchControls = IS_TOUCH ? new TouchControls(player, camera) : null;
if (IS_TOUCH) {
  document.getElementById('controls-desktop').classList.add('hidden');
  document.getElementById('controls-touch').classList.remove('hidden');

  // Fullscreen toggle. iPhones don't support the Fullscreen API at all,
  // so the button hides itself there rather than doing nothing.
  const fsBtn = document.getElementById('btn-fullscreen');
  const root = document.documentElement;
  const canFullscreen = root.requestFullscreen || root.webkitRequestFullscreen;
  if (canFullscreen) {
    fsBtn.classList.remove('hidden');
    fsBtn.addEventListener('click', () => {
      const isFs = document.fullscreenElement || document.webkitFullscreenElement;
      if (isFs) {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      } else {
        (root.requestFullscreen || root.webkitRequestFullscreen).call(root)
          .catch?.(() => {});
        // Landscape suits the joystick layout; ignore if the device refuses.
        screen.orientation?.lock?.('landscape').catch(() => {});
      }
    });
    document.addEventListener('fullscreenchange', () => {
      fsBtn.textContent = document.fullscreenElement ? '✕' : '⛶';
    });
  }
}

// 'menu' | 'playing' | 'dying' | 'dead' | 'escaped'
let gameState = 'menu';
// null until a mode is chosen: 'single' | 'host' | 'guest'
let mode = null;
let net = null;
let remote = null;
let hasKey = false;
let doorOpen = false;
let flashlightWarned = false;
let lockedMessageCooldown = 0;
let sendTimer = 0;

const monster = new Monster(
  level.scene,
  level.walkable,
  level.monsterCell,
  level.wallMeshes,
  audio,
  onMonsterCatch
);

function spawnAt(cell, faceEast = true) {
  const { x, z } = cellToWorld(cell.col, cell.row);
  camera.position.set(x, 1.7, z);
  if (faceEast) camera.rotation.y = -Math.PI / 2;
}

// --- UI helpers ---
function setObjective(text) {
  objectiveEl.textContent = text;
}
let messageTimer = null;
function showMessage(text, seconds = 3) {
  messageEl.textContent = text;
  messageEl.style.opacity = 1;
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => { messageEl.style.opacity = 0; }, seconds * 1000);
}

// --- Menu wiring ---
document.getElementById('btn-single').addEventListener('click', () => {
  startGame('single');
});

document.getElementById('btn-host').addEventListener('click', async () => {
  audio.resume();
  menu.classList.add('hidden');
  hostPanel.classList.remove('hidden');
  net = makeNetwork();
  try {
    const pin = await net.host();
    pinDisplay.textContent = pin;
    hostStatus.textContent = 'Waiting for your friend — or enter alone, they can join mid-game.';
  } catch {
    hostStatus.textContent = 'Could not reach the matchmaking service. Check your internet.';
  }
});

document.getElementById('btn-enter-host').addEventListener('click', () => {
  startGame('host');
});

document.getElementById('btn-join').addEventListener('click', () => {
  audio.resume();
  menu.classList.add('hidden');
  joinPanel.classList.remove('hidden');
  pinInput.focus();
});

document.getElementById('btn-join-go').addEventListener('click', async () => {
  const pin = pinInput.value.trim();
  if (!/^\d{6}$/.test(pin)) {
    joinStatus.textContent = 'The PIN is 6 digits.';
    return;
  }
  joinStatus.textContent = 'Connecting...';
  net = makeNetwork();
  try {
    await net.join(pin);
    startGame('guest');
  } catch {
    joinStatus.textContent = 'Could not find that session. Check the PIN and try again.';
  }
});
pinInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-join-go').click();
});

function makeNetwork() {
  const n = new Network();
  n.on('connect', () => {
    if (!remote) remote = new RemotePlayer(level.scene);
    if (mode === 'host' || gameState !== 'menu') showMessage('Your friend is here. You are not alone anymore.', 4);
    else hostStatus.textContent = 'Your friend is connected!';
  });
  n.on('data', onNetData);
  n.on('disconnect', () => {
    if (remote) remote.hide();
    if (gameState === 'playing') showMessage('Your friend is gone...', 4);
  });
  return n;
}

function startGame(m) {
  mode = m;
  gameState = 'playing';
  hasKey = false;
  doorOpen = false;
  // Guest spawns one cell east of the host so they don't overlap.
  spawnAt(m === 'guest'
    ? { col: level.spawnCell.col + 1, row: level.spawnCell.row }
    : level.spawnCell);
  if (net && net.connected && !remote) remote = new RemotePlayer(level.scene);
  setObjective('Find the key.');
  audio.resume();
  overlay.classList.add('hidden');
  if (IS_TOUCH) {
    // No pointer lock on mobile — the touch UI drives everything.
    player.mobile = true;
    touchControls.show();
  } else {
    player.lock();
  }
}

// --- Pointer lock & screens ---
player.controls.addEventListener('lock', () => {
  pauseScreen.classList.add('hidden');
});
player.controls.addEventListener('unlock', () => {
  if (gameState === 'playing') pauseScreen.classList.remove('hidden');
});
pauseScreen.addEventListener('click', () => player.lock());
deathScreen.addEventListener('click', () => location.reload());
winScreen.addEventListener('click', () => location.reload());

// --- Network protocol ---
const myRole = () => (mode === 'host' ? 'host' : 'guest');

function onNetData(d) {
  switch (d.t) {
    case 's': // 20Hz state
      if (remote) remote.setState(d.p, d.ry, d.fl);
      if (mode === 'guest') {
        if (d.m) monster.applyNet(d.m);
        if (d.k && !hasKey) grantKey(true);
        if (d.d && !doorOpen) openDoor(true);
      }
      break;
    case 'key':
      if (!hasKey) grantKey(true);
      break;
    case 'door':
      if (!doorOpen) openDoor(true);
      break;
    case 'caught':
      if (d.who === myRole()) {
        // Host's simulation says the monster got ME (guest side).
        if (gameState === 'playing') startDeathSequence();
      } else if (gameState === 'playing') {
        friendCaught();
      }
      break;
    case 'escaped':
      if (gameState === 'playing') showWin();
      break;
  }
}

function sendState(dt) {
  if (!net || !net.connected) return;
  sendTimer -= dt;
  if (sendTimer > 0) return;
  sendTimer = 0.05; // 20Hz

  const yaw = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ').y;
  const msg = {
    t: 's',
    p: [camera.position.x, camera.position.y, camera.position.z],
    ry: yaw,
    fl: player.flashlight.visible,
  };
  if (mode === 'host') {
    msg.m = monster.serialize();
    msg.k = hasKey ? 1 : 0;
    msg.d = doorOpen ? 1 : 0;
  }
  net.send(msg);
}

// --- Death / win ---
function onMonsterCatch(targetIndex) {
  // Runs on the simulating side (single or host). Index 0 = me, 1 = friend.
  if (targetIndex === 0) {
    startDeathSequence();
    if (net) net.send({ t: 'caught', who: myRole() });
  } else {
    if (net) net.send({ t: 'caught', who: 'guest' });
    friendCaught();
  }
}

let deathTime = 0;
function startDeathSequence() {
  gameState = 'dying';
  deathTime = 0;
  audio.stopHeartbeat();
  audio.jumpscare();
  redflash.style.opacity = 1;
}

function friendCaught() {
  audio.scream();
  audio.stopHeartbeat();
  gameState = 'dead';
  deathTitle.textContent = 'IT TOOK YOUR FRIEND';
  player.controls.unlock();
  pauseScreen.classList.add('hidden');
  deathScreen.classList.remove('hidden');
}

function updateDeath(dt) {
  deathTime += dt;

  // Monster closes the last gap fast and fills the screen.
  const monsterPos = monster.position;
  const toCam = camera.position.clone().setY(0).sub(monsterPos.clone().setY(0));
  if (toCam.length() > 0.45) {
    toCam.normalize();
    monsterPos.addScaledVector(toCam, dt * 6);
  }

  // Force the player to look at its face.
  const headWorld = new THREE.Vector3();
  monster.head.getWorldPosition(headWorld);
  const look = new THREE.Matrix4().lookAt(camera.position, headWorld, camera.up);
  const targetQuat = new THREE.Quaternion().setFromRotationMatrix(look);
  camera.quaternion.slerp(targetQuat, Math.min(dt * 10, 1));

  if (deathTime > 1.4 && gameState === 'dying') {
    gameState = 'dead';
    deathTitle.textContent = 'IT GOT YOU';
    player.controls.unlock();
    pauseScreen.classList.add('hidden');
    deathScreen.classList.remove('hidden');
  }
}

function showWin() {
  gameState = 'escaped';
  audio.stopHeartbeat();
  player.controls.unlock();
  pauseScreen.classList.add('hidden');
  winScreen.classList.remove('hidden');
}

// --- Objectives ---
function grantKey(byFriend) {
  hasKey = true;
  level.key.visible = false;
  audio.pickup();
  setObjective('Find the exit door.');
  showMessage(byFriend ? 'Your friend found a key.' : 'You found a rusty key.');
}

function openDoor(byFriend) {
  doorOpen = true;
  audio.doorOpen();
  setObjective('GET OUT.');
  showMessage(byFriend ? 'Somewhere, a lock turns...' : 'The lock turns...');
  const i = level.colliders.indexOf(level.doorCollider);
  if (i !== -1) level.colliders.splice(i, 1);
}

function updateObjectives(dt) {
  lockedMessageCooldown -= dt;

  // Key: hover animation + pickup by touch.
  if (!hasKey) {
    level.key.rotation.y += dt * 1.5;
    level.key.position.y = 1.1 + Math.sin(clock.elapsedTime * 2) * 0.08;
    if (camera.position.distanceTo(level.key.position) < 1.3) {
      grantKey(false);
      if (net) net.send({ t: 'key' });
    }
  }

  // Door: opens when close with the key; blocks and taunts without it.
  if (!doorOpen) {
    const doorDist = camera.position.distanceTo(
      new THREE.Vector3(level.door.position.x, camera.position.y, level.door.position.z)
    );
    if (doorDist < 3.2) {
      if (hasKey) {
        openDoor(false);
        if (net) net.send({ t: 'door' });
      } else if (lockedMessageCooldown <= 0) {
        showMessage('Locked. There must be a key somewhere.');
        lockedMessageCooldown = 4;
      }
    }
  } else {
    // Door slides down into the floor.
    if (level.door.position.y > -3.1) level.door.position.y -= dt * 1.5;

    // Standing in the exit cell = escaped.
    const cell = worldToCell(camera.position.x, camera.position.z);
    if (cell.col === level.exitCell.col && cell.row === level.exitCell.row) {
      if (net) net.send({ t: 'escaped' });
      showWin();
    }
  }

  // One-time hint the first time the flashlight comes on.
  if (!flashlightWarned && player.flashlight.visible) {
    flashlightWarned = true;
    showMessage('The light draws attention...', 4);
  }
}

// --- Resize handling ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Debug handle for automated tests (not part of the game).
window.__game = { player, camera, monster, startGame };

// --- Main loop ---
const clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1); // clamp so tab-switch doesn't teleport
  const t = clock.elapsedTime;

  if (gameState === 'playing') {
    player.update(dt);

    if (mode === 'guest') {
      // Host simulates the monster; we just render its ghost.
      monster.updatePuppet(dt, camera.position);
      // Local heartbeat driven by the networked chase state.
      if (monster.state === 'chase') {
        audio.startHeartbeat();
        audio.setHeartbeatDistance(monster.position.distanceTo(camera.position));
      } else {
        audio.stopHeartbeat();
      }
    } else {
      const targets = [{ position: camera.position, flashlightOn: player.flashlight.visible }];
      if (mode === 'host' && remote && remote.group.visible) {
        targets.push({ position: remote.cameraPos, flashlightOn: remote.flashlightOn });
      }
      monster.update(dt, targets, t);
    }

    updateObjectives(dt);
    if (remote) remote.update(dt);
    sendState(dt);
  } else if (gameState === 'dying') {
    updateDeath(dt);
    if (remote) remote.update(dt);
  }

  // Dying bulbs: layered sine noise with occasional dropouts.
  for (const { light, base, phase } of level.flickerLights) {
    const n =
      Math.sin((t + phase) * 13.7) * 0.15 +
      Math.sin((t + phase) * 41.3) * 0.1 +
      Math.sin((t + phase) * 7.1) * 0.1;
    const dropout = Math.sin((t + phase) * 2.3) > 0.99 ? 0.15 : 1.0;
    light.intensity = base * (0.85 + n) * dropout;
  }

  renderer.render(level.scene, camera);
});
