import { Peer } from 'peerjs';

// The PIN doubles as the PeerJS room id. The prefix keeps us from
// colliding with other apps on the public PeerJS broker.
const ID_PREFIX = 'the-place-horror-v1-';

/**
 * Thin wrapper around a single PeerJS data connection (2-player co-op).
 * Uses the free public PeerJS cloud for signaling; game traffic itself
 * flows directly between the two browsers (WebRTC).
 */
export class Network {
  constructor() {
    this.peer = null;
    this.conn = null;
    this.handlers = {};
  }

  on(event, fn) {
    this.handlers[event] = fn;
  }

  _emit(event, ...args) {
    if (this.handlers[event]) this.handlers[event](...args);
  }

  /** Create a session. Resolves with the 6-digit PIN to share. */
  host() {
    return new Promise((resolve, reject) => {
      const pin = String(Math.floor(100000 + Math.random() * 900000));
      this.peer = new Peer(ID_PREFIX + pin);

      this.peer.on('open', () => resolve(pin));
      this.peer.on('error', (err) => {
        if (err.type === 'unavailable-id') {
          // Someone else is using this PIN right now — roll a new one.
          this.peer.destroy();
          this.host().then(resolve, reject);
        } else {
          this._emit('error', err);
          reject(err);
        }
      });
      this.peer.on('connection', (conn) => {
        if (this.conn) { conn.close(); return; } // 2 players max for now
        this._bind(conn);
      });
    });
  }

  /** Join a session by PIN. Resolves once connected to the host. */
  join(pin) {
    return new Promise((resolve, reject) => {
      this.peer = new Peer();
      let settled = false;
      const fail = (err) => {
        if (!settled) { settled = true; reject(err); }
        else this._emit('error', err);
      };

      this.peer.on('error', fail);
      this.peer.on('open', () => {
        const conn = this.peer.connect(ID_PREFIX + pin, { reliable: true });
        conn.on('open', () => {
          settled = true;
          this._bind(conn);
          resolve();
        });
        conn.on('error', fail);
        setTimeout(() => fail(new Error('Connection timed out.')), 12000);
      });
    });
  }

  _bind(conn) {
    this.conn = conn;
    conn.on('data', (data) => this._emit('data', data));
    conn.on('close', () => {
      this.conn = null;
      this._emit('disconnect');
    });
    this._emit('connect');
  }

  send(obj) {
    if (this.conn && this.conn.open) this.conn.send(obj);
  }

  get connected() {
    return !!(this.conn && this.conn.open);
  }
}
