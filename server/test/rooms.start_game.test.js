const spec = require("../spec");
const { startTestServer } = require("./helpers/startTestServer");
const {
  connectClient,
  emitWithAck,
  safeDisconnect,
  waitForEvent,
} = require("./helpers/socketClient");

describe("Match start gating", () => {
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

  it("rejects match:start when the caller is not the room creator", async () => {
    const host = spec.createPlayer("host");
    const guest = spec.createPlayer("guest");
    const hostSocket = await connectPlayer(host);
    const { codigo } = await emitWithAck(
      hostSocket,
      spec.EVENTS.CREATE_MATCH,
      spec.createMatchPayload(host, { game: "damas" })
    );

    const guestSocket = await connectPlayer(guest);
    await emitWithAck(
      guestSocket,
      spec.EVENTS.JOIN_MATCH,
      spec.joinMatchPayload(guest, codigo, { game: "damas" })
    );

    const ack = await emitWithAck(
      guestSocket,
      spec.EVENTS.MATCH_START,
      spec.startMatchPayload(guest, codigo)
    );
    expect(ack.ok).toBe(false);
    expect(ack.reason).toBe(spec.ACK_REASONS.NOT_HOST);
  });

  it("rejects match:start when the room is not yet full", async () => {
    const host = spec.createPlayer("host");
    const hostSocket = await connectPlayer(host);
    const { codigo } = await emitWithAck(
      hostSocket,
      spec.EVENTS.CREATE_MATCH,
      spec.createMatchPayload(host, { game: "damas" })
    );

    const ack = await emitWithAck(
      hostSocket,
      spec.EVENTS.MATCH_START,
      spec.startMatchPayload(host, codigo)
    );
    expect(ack.ok).toBe(false);
    expect(ack.reason).toBe(spec.ACK_REASONS.NOT_FULL);
  });

  it("allows the creator to start when the room is complete", async () => {
    const host = spec.createPlayer("host");
    const guest = spec.createPlayer("guest");
    const hostSocket = await connectPlayer(host);
    const { codigo } = await emitWithAck(
      hostSocket,
      spec.EVENTS.CREATE_MATCH,
      spec.createMatchPayload(host, { game: "damas" })
    );

    const guestSocket = await connectPlayer(guest);
    await emitWithAck(
      guestSocket,
      spec.EVENTS.JOIN_MATCH,
      spec.joinMatchPayload(guest, codigo, { game: "damas" })
    );

    const startPromise = waitForEvent(guestSocket, spec.EVENTS.MATCH_STARTED);
    const ack = await emitWithAck(
      hostSocket,
      spec.EVENTS.MATCH_START,
      spec.startMatchPayload(host, codigo)
    );
    expect(ack.ok).toBe(true);
    const started = await startPromise;
    expect(started.matchCode).toBe(codigo);
    expect(started.creatorNick).toContain(host.nick.split(" ")[0]);
  });
});
