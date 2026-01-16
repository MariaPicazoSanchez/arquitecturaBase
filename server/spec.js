/**
 * SERVER SPEC (source of truth for lobby/room behaviors that Vitest exercises):
 * A) Create match returns room code, stores creator nick, exposes safe lobby data.
 * B) Join match deduplicates, rejects when full, broadcasts updates to rooms/lobby.
 * C) Start match restricted to creator when room full and emits `match:started`.
 * D) Leaving notifies others, updates lobby, deletes empty rooms.
 * E) Continue only succeeds if players remain; server errors with NOT_FOUND when empty.
 * F) Lobby payloads never expose emails.
 */

const EVENTS = Object.freeze({
  LOBBY_LIST: 'listaPartidas',
  CREATE_MATCH: 'crearPartida',
  MATCH_CREATED: 'partidaCreada',
  JOIN_MATCH: 'unirAPartida',
  MATCH_JOINED: 'unidoAPartida',
  CONTINUE_MATCH: 'continuarPartida',
  MATCH_CONTINUED: 'partidaContinuada',
  MATCH_START: 'match:start',
  MATCH_STARTED: 'match:started',
  MATCH_UPDATE: 'match:update',
  MATCH_PLAYER_LEFT: 'match:player_left',
  MATCH_ENDED: 'match:ended',
  MATCH_LEAVE: 'match:leave',
});

const ACK_REASONS = Object.freeze({
  ALREADY_JOINED: 'already_joined',
  NOT_HOST: 'NOT_HOST',
  NOT_FULL: 'NOT_FULL',
  NOT_FOUND: 'NOT_FOUND',
});

const DEFAULT_GAME = 'uno';
const DEFAULT_MAX_PLAYERS = 2;

let playerCounter = 0;
const createPlayer = (prefix = 'player') => {
  playerCounter += 1;
  const suffix = `${prefix}-${playerCounter}`;
  return {
    email: `${suffix}@example.com`,
    nick: `Nick ${suffix}`,
    userId: `user-${suffix}`,
  };
};

const createMatchPayload = (player, options = {}) => ({
  email: player.email,
  nick: player.nick,
  juego: options.game || DEFAULT_GAME,
  maxPlayers: options.maxPlayers ?? DEFAULT_MAX_PLAYERS,
});

const joinMatchPayload = (player, matchCode, options = {}) => ({
  email: player.email,
  nick: player.nick,
  codigo: matchCode,
  juego: options.game,
});

const continueMatchPayload = (player, matchCode) => ({
  email: player.email,
  codigo: matchCode,
});

const startMatchPayload = (player, matchCode) => ({
  email: player.email,
  matchCode,
});

const leaveMatchPayload = (player, matchCode) => ({
  email: player.email,
  matchCode,
});

const findMatchInLobby = (lobbyList, matchCode) => {
  if (!Array.isArray(lobbyList)) return null;
  return lobbyList.find((entry) => String(entry?.codigo) === String(matchCode));
};

const ensureLobbyPayloadSafe = (entry) => {
  if (!entry) return { valid: false, reason: 'missing entry' };
  const hasEmail = (value) => typeof value === 'string' && value.includes('@');
  if (hasEmail(entry.propietario)) return { valid: false, reason: 'propietario looks like email' };
  const unsafePlayer = (entry.players || []).find((player) => hasEmail(player.displayName));
  if (unsafePlayer) return { valid: false, reason: 'player displayName looks like email' };
  return { valid: true };
};

module.exports = {
  EVENTS,
  ACK_REASONS,
  createPlayer,
  createMatchPayload,
  joinMatchPayload,
  continueMatchPayload,
  startMatchPayload,
  leaveMatchPayload,
  findMatchInLobby,
  ensureLobbyPayloadSafe,
  DEFAULT_GAME,
  DEFAULT_MAX_PLAYERS,
};
