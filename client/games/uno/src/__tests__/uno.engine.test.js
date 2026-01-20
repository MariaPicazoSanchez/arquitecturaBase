import { describe, expect, it } from 'vitest';
import {
  ACTION_TYPES,
  applyAction,
  createInitialState,
  getPlayableCards,
} from '../game/unoEngineMultiplayer.js';
import { unoEstadoBase } from '../../../../test/utils/payloadFactories.js';

describe('UNO engine helpers', () => {
  it('lets a player play a color-matching card and records lastAction', () => {
    const state = createInitialState({ numPlayers: 2, names: ['A', 'B'] });
    const player = state.players[0];
    const initialHandSize = player.hand.length;
    const playableCard =
      player.hand.find((card) => ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(card.value)) ??
      player.hand[0];
    state.discardPile = [{ id: 'top', color: playableCard.color, value: '7' }];

    const next = applyAction(state, {
      type: ACTION_TYPES.PLAY_CARD,
      playerIndex: 0,
      cardId: playableCard.id,
    });

    expect(next.lastAction).toHaveProperty('type', ACTION_TYPES.PLAY_CARD);
    expect(next.discardPile.at(-1)?.id).toBe(playableCard.id);
  });

  it('finds playable cards based on the top of the pile', () => {
    const state = unoEstadoBase();
    const player = state.players[0];
    state.discardPile = [{ id: 'top', color: player.hand[0].color, value: '0' }];
    const playable = getPlayableCards(state, 0);

    expect(playable.length).toBeGreaterThan(0);
    expect(playable.every((card) => card.color === state.discardPile[0].color || card.value === '0')).toBe(
      true,
    );
  });
});
