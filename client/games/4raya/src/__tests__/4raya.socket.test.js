import { describe, expect, it, vi } from 'vitest';
import { FakeSocket } from '../../../../test/utils/FakeSocket.js';

describe('4 en raya socket wrapper', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('subscribes, sends actions, and removes listeners on dispose', async () => {
    const fakeSocket = new FakeSocket();
    vi.doMock('socket.io-client', () => ({
      io: () => fakeSocket,
    }));

    const { create4RayaSocket } = await import('../net/4rayaSocket.js');
    const onState = vi.fn();
    const api = create4RayaSocket({
      codigo: 'game-1',
      email: 'player@demo.com',
      handlers: { onState },
    });

    vi.useFakeTimers();
    try {
      fakeSocket.serverEmit('connect');
      vi.advanceTimersByTime(1500);
      expect(fakeSocket.emits.some((entry) => entry.event === 'game:resume')).toBe(true);
    } finally {
      vi.useRealTimers();
    }

    api.sendAction({ type: 'PLACE_TOKEN', column: 2 });
    expect(fakeSocket.emits.some((entry) => entry.event === '4raya:accion')).toBe(true);

    fakeSocket.serverEmit('4raya:estado', { engine: { board: [] } });
    expect(onState).toHaveBeenCalled();

    api.dispose();
    onState.mockReset();
    fakeSocket.serverEmit('4raya:estado', { engine: { board: [] } });
    expect(onState).not.toHaveBeenCalled();
  });
});
