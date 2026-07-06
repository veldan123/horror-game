# THE PLACE

A browser-based first-person horror game. You're trapped in a dark maze with
something that hunts by sight and sound. Find the key, find the door, get out.

Play alone, or host a session and give a friend the 6-digit PIN so they can
join you — multiplayer is peer-to-peer (WebRTC via PeerJS), no game server
needed.

## Controls

| Key | Action |
| --- | --- |
| WASD | Move |
| Shift | Run |
| Mouse | Look |
| F | Flashlight — helps you see, but helps IT see you |
| ESC | Pause / release mouse |

## Run locally

```bash
npm install
npm run dev
```

Then open http://localhost:5173 in your browser.

## Tech

- [Three.js](https://threejs.org/) for rendering
- [Vite](https://vite.dev/) for dev server and builds
- [PeerJS](https://peerjs.com/) for peer-to-peer multiplayer
- All audio is procedurally synthesized with WebAudio — no sound files

## Project layout

| File | What it does |
| --- | --- |
| `src/main.js` | Game loop, menu, game states, network sync |
| `src/map.js` | The maze as an ASCII grid + BFS pathfinding |
| `src/scene-setup.js` | Builds the level: walls, lights, key, exit door |
| `src/player-controller.js` | First-person movement, collision, flashlight |
| `src/monster.js` | The thing: patrol/chase AI, line-of-sight, catches |
| `src/audio.js` | Procedural horror audio engine |
| `src/network.js` | Host/join sessions by PIN (PeerJS) |
| `src/remote-player.js` | Your friend's avatar in the world |
