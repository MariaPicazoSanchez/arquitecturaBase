const spec = require("../spec");
const { startTestServer } = require("./helpers/startTestServer");
const {
  connectClient,
  emitWithAck,
  safeDisconnect,
  waitForEvent,
} = require("./helpers/socketClient");

describe("Lobby and room listings", () => {
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

  it("creates a match and publishes a safe lobby entry for the creator", async () => {
    const host = spec.createPlayer("host");
    const socket = await connectPlayer(host);

    const lobbyPromise = waitForEvent(socket, spec.EVENTS.LOBBY_LIST);
    const ack = await emitWithAck(
      socket,
      spec.EVENTS.CREATE_MATCH,
      spec.createMatchPayload(host)
    );
    expect(ack).toBeTruthy();
    expect(ack.ok).toBe(true);
    expect(ack.codigo).toBeTruthy();
    const lobby = await lobbyPromise;
    const entry = spec.findMatchInLobby(lobby, ack.codigo);
    expect(entry).toBeTruthy();
    expect(entry.players).toHaveLength(1);
    expect(entry.propietario).toContain(host.nick.split(" ")[0]);
    expect(entry.vsBot).toBe(false);
    expect(entry.maxPlayers).toBe(spec.DEFAULT_MAX_PLAYERS);

    const safety = spec.ensureLobbyPayloadSafe(entry);
    expect(safety.valid).toBe(true);
  });

  it("sanitizes nick when it looks like an email before showing it in the lobby", async () => {
    const host = spec.createPlayer("host");
    host.nick = "payinguser@example.com";
    const socket = await connectPlayer(host);

    const lobbyPromise = waitForEvent(socket, spec.EVENTS.LOBBY_LIST);
    const ack = await emitWithAck(
      socket,
      spec.EVENTS.CREATE_MATCH,
      spec.createMatchPayload(host)
    );
    const lobby = await lobbyPromise;
    const entry = spec.findMatchInLobby(lobby, ack.codigo);
    expect(entry).toBeTruthy();
    expect(entry.propietario).not.toContain("@");
    const safety = spec.ensureLobbyPayloadSafe(entry);
    expect(safety.valid).toBe(true);
  });
});
