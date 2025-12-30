import React, { useMemo } from 'react';
import PlayerBadge from './PlayerBadge';

const TWO_PI = Math.PI * 2;
const BASE_ANGLE = Math.PI / 2; // seat 0 (local) at bottom

export function buildSeats(players, myPlayerId) {
  const list = Array.isArray(players) ? players.slice(0, 8) : [];
  const myIndex = myPlayerId != null ? list.findIndex((p) => p?.id === myPlayerId) : -1;
  const shift = myIndex > 0 ? myIndex : 0;

  const indexed = list.map((player, originalIndex) => ({ player, originalIndex }));
  return indexed.slice(shift).concat(indexed.slice(0, shift));
}

export default function TableRing({ gameState, children }) {
  const players = gameState?.players ?? [];
  const myPlayerId = gameState?.myPlayerId ?? null;
  const turnPlayerId = gameState?.turnPlayerId ?? null;
  const turnIndexRaw = typeof gameState?.turnIndex === 'number' ? gameState.turnIndex : 0;
  const direction = gameState?.direction === -1 ? -1 : 1;

  const seats = useMemo(() => {
    const resolvedTurnIndex = (() => {
      if (turnPlayerId == null || turnPlayerId === '') return turnIndexRaw;
      const idx = players.findIndex(
        (p) => String(p?.id ?? '') === String(turnPlayerId),
      );
      return idx >= 0 ? idx : turnIndexRaw;
    })();

    const ordered = buildSeats(players, myPlayerId);
    const n = Math.max(1, ordered.length);
    const step = n > 0 ? -TWO_PI / n : 0;
    const nextIndex = n > 0 ? (resolvedTurnIndex + direction + n) % n : 0;

    return ordered.map(({ player, originalIndex }, seatIndex) => {
      const angle = BASE_ANGLE + seatIndex * step;
      const radiusX = n >= 7 ? 44 : 40;
      const radiusY = n >= 7 ? 36 : 32;
      const left = 50 + Math.cos(angle) * radiusX;
      const top = 50 + Math.sin(angle) * radiusY;

      return {
        key: player?.id ?? `${seatIndex}`,
        style: { left: `${left}%`, top: `${top}%` },
        player,
        cardCount: player?.handCount ?? player?.hand?.length ?? 0,
        isTurn: originalIndex === resolvedTurnIndex,
        isNext: originalIndex === nextIndex,
        isLocal: myPlayerId != null && player?.id === myPlayerId,
      };
    });
  }, [players, myPlayerId, turnPlayerId, turnIndexRaw, direction]);

  return (
    <div className="uno-table-area">
      <div className="uno-table-seats" aria-label="Mesa">
        {seats.map((seat) => (
          <div key={seat.key} className="uno-seat-pos seat" style={seat.style}>
            <PlayerBadge
              player={seat.player}
              cardCount={seat.cardCount}
              isTurn={seat.isTurn}
              isNext={seat.isNext}
              isLocal={seat.isLocal}
            />
          </div>
        ))}
      </div>

      <div className="uno-table-center">
        <div className="uno-table-center-inner">{children}</div>
      </div>
    </div>
  );
}
