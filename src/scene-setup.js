import * as THREE from 'three';
import { MAP, ROWS, COLS, CELL, parseMap, cellToWorld } from './map.js';

const WALL_HEIGHT = 3;

/**
 * Builds the maze level from the ASCII map.
 * Returns everything main.js and the monster need:
 * scene, colliders (Box3), wallMeshes (for line-of-sight), spawn points,
 * the key and exit door objects, and the flickering lights.
 */
export function setupScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.Fog(0x000000, 1, 13);

  const { walkable, spawn, key: keyCell, monster: monsterCell, exit: exitCell } = parseMap();

  const colliders = [];
  const wallMeshes = [];

  // --- Materials ---
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x4d4a42,
    roughness: 0.95,
  });
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x2b2926,
    roughness: 1.0,
  });
  const ceilingMat = new THREE.MeshStandardMaterial({
    color: 0x201e1d,
    roughness: 1.0,
  });

  // --- Floor & ceiling ---
  const size = Math.max(ROWS, COLS) * CELL + 4;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(size, size), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(size, size), ceilingMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = WALL_HEIGHT;
  scene.add(ceiling);

  // --- Walls: one box per '#' cell ---
  const wallGeo = new THREE.BoxGeometry(CELL, WALL_HEIGHT, CELL);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (MAP[r][c] !== '#') continue;
      const { x, z } = cellToWorld(c, r);
      const wall = new THREE.Mesh(wallGeo, wallMat);
      wall.position.set(x, WALL_HEIGHT / 2, z);
      wall.castShadow = true;
      wall.receiveShadow = true;
      scene.add(wall);
      wallMeshes.push(wall);
      colliders.push(new THREE.Box3().setFromObject(wall));
    }
  }

  // --- The key: floating, slowly spinning, faint glow ---
  const keyGroup = new THREE.Group();
  const keyMat = new THREE.MeshStandardMaterial({
    color: 0xbb9944,
    emissive: 0xaa7722,
    emissiveIntensity: 0.7,
    metalness: 0.8,
    roughness: 0.35,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 8, 20), keyMat);
  keyGroup.add(ring);
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.02), keyMat);
  shaft.position.y = -0.19;
  keyGroup.add(shaft);
  const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.02), keyMat);
  tooth.position.set(0.04, -0.27, 0);
  keyGroup.add(tooth);

  const keyPos = cellToWorld(keyCell.col, keyCell.row);
  keyGroup.position.set(keyPos.x, 1.1, keyPos.z);
  const keyLight = new THREE.PointLight(0xcc9933, 2.5, 3.5, 2);
  keyGroup.add(keyLight);
  scene.add(keyGroup);

  // --- The exit door: blocks its cell until unlocked ---
  const doorMat = new THREE.MeshStandardMaterial({
    color: 0x5a2020,
    roughness: 0.7,
    metalness: 0.2,
  });
  const doorPos = cellToWorld(exitCell.col, exitCell.row);
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(CELL * 0.96, WALL_HEIGHT, CELL * 0.96),
    doorMat
  );
  door.position.set(doorPos.x, WALL_HEIGHT / 2, doorPos.z);
  door.castShadow = true;
  scene.add(door);
  const doorCollider = new THREE.Box3().setFromObject(door);
  colliders.push(doorCollider);

  // Sickly green "way out" glow above the door.
  const exitLight = new THREE.PointLight(0x33aa44, 5, 6, 2);
  exitLight.position.set(doorPos.x - CELL, 2.6, doorPos.z);
  scene.add(exitLight);

  // --- Lighting: barely enough to navigate ---
  const ambient = new THREE.AmbientLight(0x9099bb, 0.32);
  scene.add(ambient);

  const flickerLights = [];
  // A few dying bulbs scattered through the maze (cells picked on corridors).
  const bulbCells = [
    { col: 3, row: 1, color: 0xffaa55 },
    { col: 8, row: 7, color: 0xffaa55 },
    { col: 4, row: 13, color: 0xff9944 },
    { col: 13, row: 5, color: 0xaabbff },
  ];
  for (const { col, row, color } of bulbCells) {
    const bulb = new THREE.PointLight(color, 16, 11, 2);
    const { x, z } = cellToWorld(col, row);
    bulb.position.set(x, 2.7, z);
    scene.add(bulb);
    flickerLights.push({ light: bulb, base: bulb.intensity, phase: Math.random() * 100 });
  }

  return {
    scene,
    colliders,
    wallMeshes,
    walkable,
    spawnCell: spawn,
    monsterCell,
    exitCell,
    key: keyGroup,
    door,
    doorCollider,
    flickerLights,
  };
}
