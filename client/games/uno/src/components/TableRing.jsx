import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import PlayerBadge from './PlayerBadge';

const TWO_PI = Math.PI * 2;
const BASE_ANGLE = Math.PI / 2; // seat 0 (local) at bottom
const SEAT_EDGE_PADDING_PX = 14;
const DEFAULT_SEAT_W = 200;
const DEFAULT_SEAT_H = 78;

const REACTION_ICONS = [
  '👍',
  '👎',
  '👏',
  '😂',
  '😭',
  '😮',
  '😤',
  '😎',
  '🙏',
  '🤝',
  '❤️',
  '💀',
  '🧠',
  '🥲',
];

function resolveInboardSide(dx, dy) {
  const useX = Math.abs(dx) >= Math.abs(dy);
  const outer = useX ? (dx >= 0 ? 'right' : 'left') : dy >= 0 ? 'bottom' : 'top';
  if (outer === 'right') return 'left';
  if (outer === 'left') return 'right';
  if (outer === 'top') return 'bottom';
  return 'top';
}

function buildSeats(players, myPlayerId) {
  const list = Array.isArray(players) ? players.slice(0, 8) : [];
  const myIndex = myPlayerId != null ? list.findIndex((p) => p?.id === myPlayerId) : -1;
  const shift = myIndex > 0 ? myIndex : 0;

  const indexed = list.map((player, originalIndex) => ({ player, originalIndex }));
  return indexed.slice(shift).concat(indexed.slice(0, shift));
}

export default function TableRing({ gameState, children, onSendReaction, reactionOverlay }) {
  const areaRef = useRef(null);
  const [metrics, setMetrics] = useState({ width: 0, height: 0, seatWidth: 0, seatHeight: 0 });
  const [openReactionForPlayerId, setOpenReactionForPlayerId] = useState(null);

  const players = gameState?.players ?? [];
  const myPlayerId = gameState?.myPlayerId ?? null;
  const turnPlayerId = gameState?.turnPlayerId ?? null;
  const turnIndexRaw = typeof gameState?.turnIndex === 'number' ? gameState.turnIndex : 0;
  const direction = gameState?.direction === -1 ? -1 : 1;

  useEffect(() => {
    if (!openReactionForPlayerId) return undefined;

    const onPointerDownCapture = (e) => {
      const target = e?.target;
      if (target && target.closest) {
        if (target.closest('.uno-reaction-popover') || target.closest('.uno-reaction-btn')) return;
      }
      setOpenReactionForPlayerId(null);
    };

    const onKeyDown = (e) => {
      if (e?.key === 'Escape') setOpenReactionForPlayerId(null);
    };

    document.addEventListener('pointerdown', onPointerDownCapture, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDownCapture, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openReactionForPlayerId]);

  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return undefined;

    const update = () => {
      const rect = el.getBoundingClientRect();
      const seatEl = el.querySelector('.uno-seat-pos');
      const seatRect = seatEl ? seatEl.getBoundingClientRect() : null;
      const next = {
        width: rect.width,
        height: rect.height,
        seatWidth: seatRect ? seatRect.width : 0,
        seatHeight: seatRect ? seatRect.height : 0,
      };
      setMetrics((prev) => {
        const same =
          Math.abs(prev.width - next.width) < 0.5 &&
          Math.abs(prev.height - next.height) < 0.5 &&
          Math.abs(prev.seatWidth - next.seatWidth) < 0.5 &&
          Math.abs(prev.seatHeight - next.seatHeight) < 0.5;
        return same ? prev : next;
      });
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

    const hasSize = metrics.width > 0 && metrics.height > 0;
    const seatWidth = metrics.seatWidth > 0 ? metrics.seatWidth : DEFAULT_SEAT_W;
    const seatHeight = metrics.seatHeight > 0 ? metrics.seatHeight : DEFAULT_SEAT_H;

    // Keep each seat fully inside the table bounds (accounts for real seat box size).
    const radiusX = hasSize
      ? Math.max(0, metrics.width / 2 - seatWidth / 2 - SEAT_EDGE_PADDING_PX)
      : n >= 7
        ? 44
        : 40;
    const radiusY = hasSize
      ? Math.max(0, metrics.height / 2 - seatHeight / 2 - SEAT_EDGE_PADDING_PX)
      : n >= 7
        ? 36
        : 32;

    return ordered.map(({ player, originalIndex }, seatIndex) => {
      const angle = BASE_ANGLE + seatIndex * step;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const left = hasSize
        ? metrics.width / 2 + dx * radiusX
        : 50 + dx * radiusX;
      const top = hasSize
        ? metrics.height / 2 + dy * radiusY
        : 50 + dy * radiusY;

      return {
        key: player?.id ?? `${seatIndex}`,
        style: hasSize ? { left: `${left}px`, top: `${top}px` } : { left: `${left}%`, top: `${top}%` },
        player,
        cardCount: player?.handCount ?? player?.hand?.length ?? 0,
        isTurn: originalIndex === resolvedTurnIndex,
        isNext: originalIndex === nextIndex,
        isLocal: myPlayerId != null && player?.id === myPlayerId,
        reactionSide: resolveInboardSide(dx, dy),
      };
    });
  }, [
    players,
    myPlayerId,
    turnPlayerId,
    turnIndexRaw,
    direction,
    metrics.width,
    metrics.height,
    metrics.seatWidth,
    metrics.seatHeight,
  ]);

  return (
    <div ref={areaRef} className="uno-table-area">
      {reactionOverlay}
      <div className="uno-table-seats" aria-label="Mesa">
        {seats.map((seat) => (
          <div
            key={seat.key}
            className="uno-seat-pos seat"
            style={seat.style}
            data-reaction-side={seat.reactionSide}
          >
            <PlayerBadge
              player={seat.player}
              cardCount={seat.cardCount}
              isTurn={seat.isTurn}
              isNext={seat.isNext}
              isLocal={seat.isLocal}
            />

            {typeof onSendReaction === 'function' &&
              !!seat.player &&
              !seat.isLocal &&
              !seat.player?.isBot && (
                <>
                  <button
                    type="button"
                    className="uno-reaction-btn"
                    aria-label={`Enviar reacción a ${seat.player?.name ?? 'Jugador'}`}
                    title="Reaccionar"
                    onClick={(e) => {
                      e.stopPropagation();
                      const id = seat.player?.id == null ? null : String(seat.player.id);
                      if (!id) return;
                      setOpenReactionForPlayerId((prev) => (prev === id ? null : id));
                    }}
                  >
                    🙂
                  </button>

                  {openReactionForPlayerId != null &&
                    String(openReactionForPlayerId) === String(seat.player?.id ?? '') && (
                      <div
                        className="uno-reaction-popover"
                        role="menu"
                        aria-label={`Reacciones para ${seat.player?.name ?? 'Jugador'}`}
                      >
                        {REACTION_ICONS.map((icon) => (
                          <button
                            key={icon}
                            type="button"
                            className="uno-reaction-item"
                            role="menuitem"
                            aria-label={`Enviar ${icon}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              const id = seat.player?.id == null ? null : String(seat.player.id);
                              if (!id) return;
                              onSendReaction(id, icon);
                              setOpenReactionForPlayerId(null);
                            }}
                          >
                            {icon}
                          </button>
                        ))}
                      </div>
                    )}
                </>
              )}
          </div>
        ))}
      </div>

      <div className="uno-table-center">
        <div className="uno-table-center-inner">{children}</div>
      </div>
    </div>
  );
}
