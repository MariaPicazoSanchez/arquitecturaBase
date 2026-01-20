import { describe, expect, it, vi } from 'vitest';
import { FakeSocket } from '../../../../test/utils/FakeSocket.js';
import { createDamasSocket } from '../net/damasSocket.js';

describe('Damas socket wrapper', () => {
  it('subscribes, emits moves, and cleans up listeners', () => {
    const socket = new FakeSocket();
    const onState = vi.fn();
    const net = createDamasSocket(socket, {
      codigo: '001',
      email: 'player@demo.com',
      handlers: { onState },
    });

    vi.useFakeTimers();
    try {
      net.subscribe();
      socket.serverEmit('connect');
      vi.advanceTimersByTime(1500);
      expect(socket.emits.some((entry) => entry.event === 'game:resume')).toBe(true);
    } finally {
      vi.useRealTimers();
    }

    net.sendAction({ from: { r: 0, c: 1 }, to: { r: 1, c: 2 } });
    expect(socket.emits.some((entry) => entry.event === 'damas_move')).toBe(true);

    net.requestRematch();
    expect(socket.emits.some((entry) => entry.event === 'checkers:rematch_request')).toBe(true);

    net.voteRematch('yes');
    expect(socket.emits.some((entry) => entry.event === 'checkers:rematch_vote')).toBe(true);

    net.dispose();
    onState.mockReset();
    socket.serverEmit('damas_state', {});
    expect(onState).not.toHaveBeenCalled();
  });
});
