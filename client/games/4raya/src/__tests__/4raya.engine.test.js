import { describe, expect, it } from 'vitest';
import {
  buildWinningSet,
  createInitialEngineState,
  deriveStatusText,
} from '../engine/4rayaEngine.js';

describe('4 en raya engine helpers', () => {
  it('builds a winning set only when reviewing the end', () => {
    const state = createInitialEngineState();
    const finalized = { ...state, winningCells: [{ r: 0, c: 1 }, { r: 2, c: 3 }], status: 'finished' };

    const setWhenReviewing = buildWinningSet(finalized, true);
    expect(setWhenReviewing).toEqual(new Set(['0,1', '2,3']));
    expect(buildWinningSet(finalized, false)).toBeNull();
  });

  it('derives human-readable status text', () => {
    const state = createInitialEngineState();
    expect(deriveStatusText(state, null, false)).toContain('Esperando');

    const finishedState = { ...state, status: 'finished', winnerIndex: 0 };
    expect(deriveStatusText(finishedState, 0, false)).toBe('¡Has ganado!');
  });
});
