import { describe, expect, it } from 'vitest';
import { createDamasEngine } from '../engine/damasEngine.js';
import { damasEstadoBase } from '../../../../test/utils/payloadFactories.js';

describe('Damas engine helpers', () => {
  it('tracks rematch metadata when a rematch state arrives', () => {
    const engine = createDamasEngine({ codigo: 'ABC', myPlayerId: 'player' });
    engine.state = damasEstadoBase();

    const handled = engine.handleRematchState({
      matchCode: 'ABC',
      active: true,
      voters: ['player'],
      required: 2,
    });

    expect(handled).toBe(true);
    expect(engine.rematch).toEqual({ active: true, voters: ['player'], required: 2 });
    expect(engine.rematchCancelledReason).toBeNull();
  });

  it('replaces the state when a rematch start arrives', () => {
    const engine = createDamasEngine({ codigo: 'ABC', myPlayerId: 'player' });
    engine.state = damasEstadoBase();
    engine.rematch = { active: true, voters: ['player'], required: 2 };

    const newState = { ...damasEstadoBase(), currentPlayer: 'black' };
    const result = engine.handleRematchStart({ matchCode: 'ABC', newState });

    expect(result.handled).toBe(true);
    expect(result.updated).toBe(true);
    expect(engine.state.currentPlayer).toBe('black');
    expect(engine.rematch).toBeNull();
    expect(engine.restartPending).toBe(false);
  });
});
