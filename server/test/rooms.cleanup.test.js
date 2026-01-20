const spec = require("../spec");
const { startTestServer } = require("./helpers/startTestServer");
const {
  connectClient,
  emitWithAck,
  safeDisconnect,
  waitForEvent,
} = require("./helpers/socketClient");

describe("Room cleanup and continue", () => {
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

  it("removes matches when all players leave and rejects continuarPartida afterwards", async () => {
    const host = spec.createPlayer("host");
    const guest = spec.createPlayer("guest");
    const observer = spec.createPlayer("observer");
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

    const observerSocket = await connectPlayer(observer);
    const playerLeft = waitForEvent(hostSocket, spec.EVENTS.MATCH_PLAYER_LEFT);
    await emitWithAck(
      guestSocket,
      spec.EVENTS.MATCH_LEAVE,
      spec.leaveMatchPayload(guest, codigo)
    );
    await playerLeft;

    const matchEnded = waitForEvent(observerSocket, spec.EVENTS.MATCH_ENDED);
    const lobbyAfterPromise = waitForEvent(observerSocket, spec.EVENTS.LOBBY_LIST);
    const hostEndedAck = await emitWithAck(
      hostSocket,
      spec.EVENTS.MATCH_LEAVE,
      spec.leaveMatchPayload(host, codigo)
    );
    expect(hostEndedAck.ok).toBe(true);

    const endedPayload = await matchEnded;
    expect(endedPayload.matchCode).toBe(codigo);

    observerSocket.emit("obtenerListaPartidas", { juego: spec.DEFAULT_GAME });
    const lobbyAfter = await lobbyAfterPromise;
    expect(spec.findMatchInLobby(lobbyAfter, codigo)).toBeUndefined();

    const returningHost = { ...host };
    const returningSocket = await connectPlayer(returningHost);
    const continueAck = await emitWithAck(
      returningSocket,
      spec.EVENTS.CONTINUE_MATCH,
      spec.continueMatchPayload(returningHost, codigo)
    );
    expect(continueAck.ok).toBe(false);
    expect(continueAck.reason).toBe(spec.ACK_REASONS.NOT_FOUND);
  });
});
