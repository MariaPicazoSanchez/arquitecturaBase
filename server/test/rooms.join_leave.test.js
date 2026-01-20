const spec = require("../spec");
const { startTestServer } = require("./helpers/startTestServer");
const {
  connectClient,
  emitWithAck,
  safeDisconnect,
  waitForEvent,
} = require("./helpers/socketClient");

describe("Room join/leave workflow", () => {
  let server;
  const clients = [];

  beforeEach(async () => {
    server = await startTestServer();
  });

  afterEach(async () => {
    clients.forEach((socket) => safeDisconnect(socket));
    clients.length = 0;
    if (server) await server.stop();
    server = null;
  });

  const connectPlayer = async (player) => {
    const socket = await connectClient(server.baseUrl, player);
    clients.push(socket);
    return socket;
  };

  it("does not allow the creator to rejoin as a duplicate seat", async () => {
    const host = spec.createPlayer("host");
    const socket = await connectPlayer(host);
    const { codigo } = await emitWithAck(
      socket,
      spec.EVENTS.CREATE_MATCH,
      spec.createMatchPayload(host)
    );
    const payloadPromise = waitForEvent(socket, spec.EVENTS.MATCH_JOINED);
    const joined = await emitWithAck(
      socket,
      spec.EVENTS.JOIN_MATCH,
      spec.joinMatchPayload(host, codigo)
    );
    expect(joined.ok).toBe(true);
    expect(joined.reason).toBe(spec.ACK_REASONS.ALREADY_JOINED);

    const payload = await payloadPromise;
    expect(payload.alreadyJoined).toBe(true);
    expect(payload.codigo).toBe(codigo);
  });

  it("marks the lobby full once the second player joins and rejects a third", async () => {
    const host = spec.createPlayer("host");
    const guest = spec.createPlayer("guest");
    const lateGuest = spec.createPlayer("late");
    const hostSocket = await connectPlayer(host);
    const { codigo } = await emitWithAck(
      hostSocket,
      spec.EVENTS.CREATE_MATCH,
      spec.createMatchPayload(host)
    );

    const guestSocket = await connectPlayer(guest);
    const updatePromise = waitForEvent(hostSocket, spec.EVENTS.MATCH_UPDATE);
    const lobbyPromise = waitForEvent(hostSocket, spec.EVENTS.LOBBY_LIST);
    const joinAck = await emitWithAck(
      guestSocket,
      spec.EVENTS.JOIN_MATCH,
      spec.joinMatchPayload(guest, codigo)
    );
    expect(joinAck.ok).toBe(true);

    const matchUpdate = await updatePromise;
    expect(matchUpdate.playersCount).toBe(spec.DEFAULT_MAX_PLAYERS);
    expect(matchUpdate.status).toBeDefined();

    const lobby = await lobbyPromise;
    const entry = spec.findMatchInLobby(lobby, codigo);
    expect(entry).toBeTruthy();
    expect(entry.status).toBe("FULL");

    const lateSocket = await connectPlayer(lateGuest);
    const lateAck = await emitWithAck(
      lateSocket,
      spec.EVENTS.JOIN_MATCH,
      spec.joinMatchPayload(lateGuest, codigo)
    );
    expect(lateAck.ok).toBe(false);
    expect(lateAck.reason).toBe("FULL");

  });

  it("notifies remaining players when someone leaves", async () => {
    const host = spec.createPlayer("host");
    const guest = spec.createPlayer("guest");
    const hostSocket = await connectPlayer(host);
    const { codigo } = await emitWithAck(
      hostSocket,
      spec.EVENTS.CREATE_MATCH,
      spec.createMatchPayload(host)
    );

    const guestSocket = await connectPlayer(guest);
    await emitWithAck(
      guestSocket,
      spec.EVENTS.JOIN_MATCH,
      spec.joinMatchPayload(guest, codigo)
    );

    const leftPromise = waitForEvent(hostSocket, spec.EVENTS.MATCH_PLAYER_LEFT);
    const leaveAck = await emitWithAck(
      guestSocket,
      spec.EVENTS.MATCH_LEAVE,
      spec.leaveMatchPayload(guest, codigo)
    );
    expect(leaveAck.ok).toBe(true);

    const event = await leftPromise;
    expect(event.reason).toBe("leave");
    expect(event.playerNick).not.toContain("@");

    const lobbyPromise = waitForEvent(hostSocket, spec.EVENTS.LOBBY_LIST);
    hostSocket.emit("obtenerListaPartidas", { juego: spec.DEFAULT_GAME });
    const lobby = await lobbyPromise;
    const entry = spec.findMatchInLobby(lobby, codigo);
    expect(entry).toBeTruthy();
    expect(entry.jugadores).toBe(1);

  });
});
