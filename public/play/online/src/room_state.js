// globalThis.crypto.randomUUID exists in Node >=19 and all modern browsers,
// so the room logic also runs inside a hosting player's browser.
const randomUUID = () => globalThis.crypto.randomUUID();

export const MAX_ROOM_CAPACITY = 4;

export const PLAYER_COLORS = [
  { slot: 0, name: 'Neon Yellow', hex: '#ffff00' },
  { slot: 1, name: 'Neon Cyan', hex: '#00ffff' },
  { slot: 2, name: 'Neon Pink', hex: '#ff1493' },
  { slot: 3, name: 'Neon Green', hex: '#00ff00' }
];

export function sanitizePlayerName(rawName) {
  if (typeof rawName !== 'string') {
    return 'Pac-Player';
  }
  // Remove <script> and <style> tags and their contents, then any HTML tags, control chars, and angle brackets
  const cleaned = rawName
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>?/gm, '')
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .trim();

  if (!cleaned) {
    return 'Pac-Player';
  }
  return cleaned.slice(0, 20);
}

export function validateRoomId(rawRoomId) {
  if (typeof rawRoomId !== 'string') {
    return false;
  }
  if (rawRoomId.length < 1 || rawRoomId.length > 32) {
    return false;
  }
  // Reject leading/trailing whitespace and spaces outright with exact regex
  return /^[a-zA-Z0-9_-]+$/.test(rawRoomId);
}

export function createRoomManager() {
  const rooms = new Map();
  const clientToRoom = new Map();

  function getRoom(roomId) {
    return rooms.get(roomId) || null;
  }

  function getRoomCount() {
    return rooms.size;
  }

  function getClientRoom(clientId) {
    const roomId = clientToRoom.get(clientId);
    if (!roomId) return null;
    return rooms.get(roomId) || null;
  }

  function joinRoom(clientId, options = {}) {
    if (!clientId) {
      return { ok: false, error: 'INVALID_CLIENT', message: 'Client identifier required' };
    }
    if (clientToRoom.has(clientId)) {
      return { ok: false, error: 'ALREADY_JOINED', message: 'Client has already joined a room' };
    }

    const { roomId, name } = options;
    if (!validateRoomId(roomId)) {
      return { ok: false, error: 'INVALID_ROOM_ID', message: 'Invalid room ID format (1-32 alphanumeric/dash/underscore chars)' };
    }

    let room = rooms.get(roomId);
    if (!room) {
      room = {
        id: roomId,
        players: new Map(),
        usedSlots: new Set()
      };
      rooms.set(roomId, room);
    }

    if (room.players.size >= MAX_ROOM_CAPACITY) {
      return { ok: false, error: 'ROOM_FULL', message: 'Room has reached maximum capacity of 4 players' };
    }

    // Allocate lowest available slot 0..3
    const slot = [0, 1, 2, 3].find(s => !room.usedSlots.has(s));
    const colorInfo = PLAYER_COLORS[slot];

    // Generate server-authoritative opaque player ID
    const playerId = `p_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const sanitizedName = sanitizePlayerName(name);

    const player = {
      id: playerId,
      name: sanitizedName,
      slot,
      color: colorInfo.hex,
      colorName: colorInfo.name
    };

    room.players.set(clientId, player);
    room.usedSlots.add(slot);
    clientToRoom.set(clientId, roomId);

    const roster = Array.from(room.players.values()).map(p => ({
      id: p.id,
      name: p.name,
      slot: p.slot,
      color: p.color,
      colorName: p.colorName
    }));

    return {
      ok: true,
      roomId,
      player,
      roster
    };
  }

  function leaveRoom(clientId) {
    if (!clientToRoom.has(clientId)) {
      return { ok: false, error: 'NOT_IN_ROOM', message: 'Client is not currently in a room' };
    }

    const roomId = clientToRoom.get(clientId);
    const room = rooms.get(roomId);
    if (!room) {
      clientToRoom.delete(clientId);
      return { ok: false, error: 'NOT_IN_ROOM', message: 'Room not found' };
    }

    const player = room.players.get(clientId);
    room.players.delete(clientId);
    if (player) {
      room.usedSlots.delete(player.slot);
    }
    clientToRoom.delete(clientId);

    const roomDeleted = room.players.size === 0;
    if (roomDeleted) {
      rooms.delete(roomId);
    }

    const roster = roomDeleted
      ? []
      : Array.from(room.players.values()).map(p => ({
          id: p.id,
          name: p.name,
          slot: p.slot,
          color: p.color,
          colorName: p.colorName
        }));

    return {
      ok: true,
      roomId,
      player,
      roster,
      roomDeleted
    };
  }

  return {
    getRoom,
    getRoomCount,
    getClientRoom,
    joinRoom,
    leaveRoom
  };
}
