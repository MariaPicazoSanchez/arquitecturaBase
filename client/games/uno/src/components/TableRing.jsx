import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import PlayerBadge from './PlayerBadge';

const TWO_PI = Math.PI * 2;
const BASE_ANGLE = Math.PI / 2; // seat 0 (local) at bottom
const SEAT_PADDING_PX = 24;

export function buildSeats(players, myPlayerId) {
  const list = Array.isArray(players) ? players.slice(0, 8) : [];
  const myIndex = myPlayerId != null ? list.findIndex((p) => p?.id === myPlayerId) : -1;
  const shift = myIndex > 0 ? myIndex : 0;

  const indexed = list.map((player, originalIndex) => ({ player, originalIndex }));
  return indexed.slice(shift).concat(indexed.slice(0, shift));
}

export default function TableRing({ gameState, children }) {
  const areaRef = useRef(null);
  const [areaSize, setAreaSize] = useState({ width: 0, height: 0 });

  const players = gameState?.players ?? [];
  const myPlayerId = gameState?.myPlayerId ?? null;
  const turnPlayerId = gameState?.turnPlayerId ?? null;
  const turnIndexRaw = typeof gameState?.turnIndex === 'number' ? gameState.turnIndex : 0;
  const direction = gameState?.direction === -1 ? -1 : 1;

  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return undefined;

    const update = () => {
      const rect = el.getBoundingClientRect();
      setAreaSize({ width: rect.width, height: rect.height });
    };

    update();

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(update);
      ro.observe(el);
      return () => ro.disconnect();
    }

    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

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

    // increase seat radius to push labels to table edges
    const hasSize = areaSize.width > 0 && areaSize.height > 0;
    const ringR = hasSize
      ? Math.max(0, Math.min(areaSize.width, areaSize.height) / 2 - SEAT_PADDING_PX)
      : 0;
    const seatR = ringR * 0.88;
    const radiusX = hasSize
      ? Math.min(Math.max(0, areaSize.width / 2 - SEAT_PADDING_PX), seatR)
      : n >= 7
        ? 44
        : 40;
    const radiusY = hasSize
      ? Math.min(Math.max(0, areaSize.height / 2 - SEAT_PADDING_PX), seatR)
      : n >= 7
        ? 36
        : 32;

    return ordered.map(({ player, originalIndex }, seatIndex) => {
      const angle = BASE_ANGLE + seatIndex * step;
      const left = hasSize
        ? areaSize.width / 2 + Math.cos(angle) * radiusX
        : 50 + Math.cos(angle) * radiusX;
      const top = hasSize
        ? areaSize.height / 2 + Math.sin(angle) * radiusY
        : 50 + Math.sin(angle) * radiusY;

      return {
        key: player?.id ?? `${seatIndex}`,
        style: hasSize ? { left: `${left}px`, top: `${top}px` } : { left: `${left}%`, top: `${top}%` },
        player,
        cardCount: player?.handCount ?? player?.hand?.length ?? 0,
        isTurn: originalIndex === resolvedTurnIndex,
        isNext: originalIndex === nextIndex,
        isLocal: myPlayerId != null && player?.id === myPlayerId,
      };
    });
  }, [players, myPlayerId, turnPlayerId, turnIndexRaw, direction, areaSize.width, areaSize.height]);

  return (
    <div ref={areaRef} className="uno-table-area">
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
