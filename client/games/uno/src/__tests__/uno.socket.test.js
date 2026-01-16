import { describe, expect, it, vi } from 'vitest';
import { ACTION_TYPES } from '../game/unoEngineMultiplayer.js';
import { FakeSocket } from '../../../../test/utils/FakeSocket.js';

describe('UNO socket wrapper', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('subscribes, emits actions, and surfaces server state', async () => {
    const fakeSocket = new FakeSocket();
    vi.doMock('socket.io-client', () => ({
      io: () => fakeSocket,
    }));

    const { createUnoSocket } = await import('../network/unoSocket.js');
    const onState = vi.fn();
    const api = createUnoSocket({
      codigo: 'test',
      email: 'uno@example.com',
      onState,
    });

    vi.useFakeTimers();
    try {
      fakeSocket.serverEmit('connect');
      vi.advanceTimersByTime(1500);
      expect(fakeSocket.emits.some((entry) => entry.event === 'game:resume')).toBe(true);
    } finally {
      vi.useRealTimers();
    }

    api.sendAction({ type: ACTION_TYPES.PLAY_CARD, cardId: 'c' });
    expect(fakeSocket.emits.some((entry) => entry.event === 'uno:accion')).toBe(true);

    fakeSocket.serverEmit('uno_state', { engine: { players: [] } });
    expect(onState).toHaveBeenCalled();

    api.disconnect();
  });
});
