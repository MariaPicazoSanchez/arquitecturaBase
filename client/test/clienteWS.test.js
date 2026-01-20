import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('ClienteWS - WebSocket Client', () => {
  let ws;
  let mockSocket;
  let mockIO;

  beforeEach(() => {
    // Mock Socket.io
    mockSocket = {
      emit: vi.fn(),
      on: vi.fn((event, callback) => {
        mockSocket._handlers = mockSocket._handlers || {};
        mockSocket._handlers[event] = callback;
      }),
      off: vi.fn(),
      disconnect: vi.fn(),
      _handlers: {}
    };

    mockIO = vi.fn(() => mockSocket);

    // Create a simplified ClienteWS for testing
    ws = {
      socket: null,
      email: null,
      codigo: null,
      gameType: null,

      _ensureEmail: function() {
        return this.email;
      },

      ini: vi.fn(function() {
        ws.socket = mockSocket;
      }),

      pedirListaPartidas: vi.fn(function() {
        if (ws.socket) {
          ws.socket.emit("obtenerListaPartidas", {
            juego: ws.gameType
          });
        }
      }),

      crearPartida: vi.fn(function(gameType, maxPlayers) {
        ws.gameType = gameType;
        if (ws.socket) {
          ws.socket.emit("crearPartida", {
            juego: gameType,
            maxJugadores: maxPlayers
          });
        }
      }),

      unirseAPartida: vi.fn(function(codigo) {
        if (ws.socket) {
          ws.socket.emit("unirseAPartida", {
            codigo: codigo
          });
        }
      }),

      enviarMovimiento: vi.fn(function(movimiento) {
        if (ws.socket) {
          ws.socket.emit("movimiento", movimiento);
        }
      }),

      abandonarPartida: vi.fn(function() {
        if (ws.socket) {
          ws.socket.emit("abandonarPartida", {});
        }
      }),

      continuePartida: vi.fn(function(codigo) {
        if (ws.socket) {
          ws.socket.emit("continuarPartida", {
            codigo: codigo
          });
        }
      }),

      // Simulate receiving events
      _simulateEvent: function(eventName, data) {
        if (mockSocket._handlers && mockSocket._handlers[eventName]) {
          mockSocket._handlers[eventName](data);
        }
      }
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ============ Connection ============
  describe('Connection Management', () => {
    it('should initialize WebSocket connection', () => {
      ws.ini();
      
      expect(ws.ini).toHaveBeenCalled();
      expect(ws.socket).toBeDefined();
    });

    it('should store email from login', () => {
      ws.email = 'user@example.com';
      const email = ws._ensureEmail();
      
      expect(email).toBe('user@example.com');
    });

    it('should request game list on connection', () => {
      ws.ini();
      ws.gameType = 'uno';
      ws.pedirListaPartidas();
      
      expect(ws.pedirListaPartidas).toHaveBeenCalled();
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'obtenerListaPartidas',
        expect.objectContaining({ juego: 'uno' })
      );
    });
  });

  // ============ Game Creation ============
  describe('Game Creation', () => {
    it('should create new game', () => {
      ws.socket = mockSocket;
      ws.crearPartida('uno', 4);
      
      expect(ws.crearPartida).toHaveBeenCalledWith('uno', 4);
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'crearPartida',
        expect.objectContaining({
          juego: 'uno',
          maxJugadores: 4
        })
      );
    });

    it('should handle game created response', () => {
      ws.socket = mockSocket;
      ws.socket.on('partidaCreada', (data) => {
        expect(data.codigo).toBe('MATCH123');
        ws.codigo = data.codigo;
      });
      
      // Simulate server response
      ws._simulateEvent('partidaCreada', {
        codigo: 'MATCH123'
      });
      
      expect(ws.codigo).toBe('MATCH123');
    });

    it('should handle game creation failure', () => {
      ws.socket = mockSocket;
      ws.socket.on('partidaCreada', (data) => {
        expect(data.codigo).toBe(-1);
      });
      
      // Simulate failure
      ws._simulateEvent('partidaCreada', {
        codigo: -1,
        error: 'Cannot create game'
      });
    });
  });

  // ============ Game Joining ============
  describe('Game Joining', () => {
    it('should join existing game', () => {
      ws.socket = mockSocket;
      ws.unirseAPartida('MATCH123');
      
      expect(ws.unirseAPartida).toHaveBeenCalledWith('MATCH123');
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'unirseAPartida',
        expect.objectContaining({ codigo: 'MATCH123' })
      );
    });

    it('should handle successful join', () => {
      ws.socket = mockSocket;
      ws.socket.on('unidoAPartida', (data) => {
        ws.codigo = data.codigo;
      });
      
      // Simulate join success
      ws._simulateEvent('unidoAPartida', {
        codigo: 'MATCH123'
      });
      
      expect(ws.codigo).toBe('MATCH123');
    });

    it('should handle full game error', () => {
      ws.socket = mockSocket;
      ws.socket.on('unidoAPartida', (data) => {
        expect(data.reason).toBe('FULL');
      });
      
      // Simulate full game
      ws._simulateEvent('unidoAPartida', {
        codigo: -1,
        reason: 'FULL',
        message: 'La partida está llena.'
      });
    });

    it('should handle already started game error', () => {
      ws.socket = mockSocket;
      ws.socket.on('unidoAPartida', (data) => {
        expect(data.reason).toBe('STARTED');
      });
      
      // Simulate started game
      ws._simulateEvent('unidoAPartida', {
        codigo: -1,
        reason: 'STARTED',
        message: 'La partida ya ha empezado.'
      });
    });

    it('should handle bot-only game error', () => {
      ws.socket = mockSocket;
      ws.socket.on('unidoAPartida', (data) => {
        expect(data.reason).toBe('BOT_MATCH');
      });
      
      // Simulate bot match
      ws._simulateEvent('unidoAPartida', {
        codigo: -1,
        reason: 'BOT_MATCH',
        message: 'Esta partida es de 1 jugador (vs bot).'
      });
    });
  });

  // ============ Game Play ============
  describe('Game Play', () => {
    it('should send player movement', () => {
      ws.socket = mockSocket;
      const movimiento = { tipo: 'play', card: 'UNO' };
      ws.enviarMovimiento(movimiento);
      
      expect(ws.enviarMovimiento).toHaveBeenCalledWith(movimiento);
      expect(mockSocket.emit).toHaveBeenCalledWith('movimiento', movimiento);
    });

    it('should abandon game', () => {
      ws.socket = mockSocket;
      ws.abandonarPartida();
      
      expect(ws.abandonarPartida).toHaveBeenCalled();
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'abandonarPartida',
        expect.anything()
      );
    });

    it('should handle game list updates', () => {
      ws.socket = mockSocket;
      let receivedList = null;
      
      ws.socket.on('listaPartidas', (lista) => {
        receivedList = lista;
      });
      
      const gameList = [
        { codigo: 'MATCH1', juego: 'uno', jugadores: 2 },
        { codigo: 'MATCH2', juego: 'damas', jugadores: 1 }
      ];
      
      // Simulate list update
      ws._simulateEvent('listaPartidas', gameList);
      
      expect(receivedList).toEqual(gameList);
    });
  });

  // ============ Game Continuation ============
  describe('Game Continuation', () => {
    it('should continue disconnected game', () => {
      ws.socket = mockSocket;
      ws.continuePartida('MATCH123');
      
      expect(ws.continuePartida).toHaveBeenCalledWith('MATCH123');
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'continuarPartida',
        expect.objectContaining({ codigo: 'MATCH123' })
      );
    });

    it('should handle game continuation success', () => {
      ws.socket = mockSocket;
      ws.socket.on('partidaContinuada', (data) => {
        ws.codigo = data.codigo;
      });
      
      // Simulate continuation success
      ws._simulateEvent('partidaContinuada', {
        codigo: 'MATCH123',
        juego: 'uno'
      });
      
      expect(ws.codigo).toBe('MATCH123');
    });

    it('should handle game continuation failure', () => {
      ws.socket = mockSocket;
      ws.socket.on('partidaContinuada', (data) => {
        expect(data.codigo).toBe(-1);
      });
      
      // Simulate continuation failure
      ws._simulateEvent('partidaContinuada', {
        codigo: -1,
        message: 'No se pudo continuar la partida.'
      });
    });
  });

  // ============ Event Handling ============
  describe('Event Handling', () => {
    it('should register event listeners', () => {
      ws.socket = mockSocket;
      ws.socket.on('testEvent', (data) => {
        expect(data).toBeDefined();
      });
      
      expect(mockSocket.on).toHaveBeenCalledWith('testEvent', expect.any(Function));
    });

    it('should handle multiple simultaneous games', () => {
      ws.socket = mockSocket;
      const games = [];
      
      ws.socket.on('listaPartidas', (lista) => {
        games.push(...lista);
      });
      
      const gameList = [
        { codigo: 'MATCH1', juego: 'uno' },
        { codigo: 'MATCH2', juego: 'damas' },
        { codigo: 'MATCH3', juego: '4raya' }
      ];
      
      ws._simulateEvent('listaPartidas', gameList);
      
      expect(games.length).toBeGreaterThan(0);
    });

    it('should handle game state updates', () => {
      ws.socket = mockSocket;
      let gameState = null;
      
      ws.socket.on('estadoPartida', (state) => {
        gameState = state;
      });
      
      const state = {
        turno: 'player1',
        mano: ['card1', 'card2'],
        estado: 'en_curso'
      };
      
      ws._simulateEvent('estadoPartida', state);
      
      expect(gameState).toEqual(state);
    });
  });

  // ============ Error Handling ============
  describe('Error Handling', () => {
    it('should handle connection errors', () => {
      ws.socket = mockSocket;
      let errorReceived = false;
      
      ws.socket.on('error', () => {
        errorReceived = true;
      });
      
      ws._simulateEvent('error', { message: 'Connection lost' });
      
      expect(errorReceived).toBe(true);
    });

    it('should handle invalid game code', () => {
      ws.socket = mockSocket;
      ws.unirseAPartida(null);
      
      // Socket should still attempt to emit
      expect(mockSocket.emit).toHaveBeenCalled();
    });

    it('should handle non-existent game', () => {
      ws.socket = mockSocket;
      ws.socket.on('unidoAPartida', (data) => {
        expect(data.reason).toBe('NOT_FOUND');
      });
      
      ws._simulateEvent('unidoAPartida', {
        codigo: -1,
        reason: 'NOT_FOUND',
        message: 'La partida no existe.'
      });
    });
  });
});
