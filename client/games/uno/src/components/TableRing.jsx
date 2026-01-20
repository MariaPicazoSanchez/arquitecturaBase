import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PlayerBadge from './PlayerBadge';
import ReactionOverlay from './ReactionOverlay';

const TWO_PI = Math.PI * 2;
const BASE_ANGLE = Math.PI / 2; // seat 0 (local) at bottom
const SEAT_EDGE_PADDING_PX = 14;
const DEFAULT_SEAT_W = 200;
const DEFAULT_SEAT_H = 78;

const REACTION_EMOJIS = [
  '\u{1F44D}', // 👍
  '\u{1F44E}', // 👎
  '\u{1F44F}', // 👏
  '\u{1F602}', // 😂
  '\u{1F62D}', // 😭
  '\u{1F62E}', // 😮
  '\u{1F624}', // 😤
  '\u{1F60E}', // 😎
  '\u{1F64F}', // 🙏
  '\u{1F91D}', // 🤝
  '\u{2764}\u{FE0F}', // ❤️
  '\u{1F480}', // 💀
  '\u{1F9E0}', // 🧠
  '\u{1F972}', // 🥲
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function computePopoverPosition({ anchorRect, popoverRect, side, gap = 10, padding = 10 }) {
  const cx = anchorRect.left + anchorRect.width / 2;
  const cy = anchorRect.top + anchorRect.height / 2;

  let left = cx - popoverRect.width / 2;
  let top = cy - popoverRect.height / 2;

  if (side === 'left') {
    left = anchorRect.left - gap - popoverRect.width;
    top = cy - popoverRect.height / 2;
  } else if (side === 'right') {
    left = anchorRect.right + gap;
    top = cy - popoverRect.height / 2;
  } else if (side === 'top') {
    left = cx - popoverRect.width / 2;
    top = anchorRect.top - gap - popoverRect.height;
  } else if (side === 'bottom') {
    left = cx - popoverRect.width / 2;
    top = anchorRect.bottom + gap;
  }

  const vw = typeof window !== 'undefined' ? window.innerWidth : 0;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 0;
  if (vw > 0) left = clamp(left, padding, Math.max(padding, vw - popoverRect.width - padding));
  if (vh > 0) top = clamp(top, padding, Math.max(padding, vh - popoverRect.height - padding));

  return { left, top };
}

function ReactionPopover({ anchorRect, preferredSide = 'right', disabled = false, onSelect }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !anchorRect) return;
    const popoverRect = el.getBoundingClientRect();
    const vw = typeof window !== 'undefined' ? window.innerWidth : 0;
    const padding = 10;
    const gap = 10;

    const canRight =
      vw > 0 ? anchorRect.right + gap + popoverRect.width + padding <= vw : true;
    const canTop =
      anchorRect.top - gap - popoverRect.height - padding >= 0;

    // Prefer opening outwards (right) and fall back to above on small screens / near right edge.
    const resolvedSide =
      preferredSide === 'right'
        ? canRight
          ? 'right'
          : canTop
            ? 'top'
            : 'bottom'
        : preferredSide;

    setPos(computePopoverPosition({ anchorRect, popoverRect, side: resolvedSide, gap, padding }));
  }, [anchorRect, preferredSide]);

  if (!anchorRect) return null;

  const content = (
    <div
      ref={ref}
      className="uno-reaction-popover"
      role="menu"
      aria-label="Reacciones"
      style={pos ? { left: `${pos.left}px`, top: `${pos.top}px` } : undefined}
    >
      {REACTION_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          className="uno-reaction-item"
          role="menuitem"
          aria-label={`Enviar ${emoji}`}
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            if (disabled) return;
            onSelect?.(emoji);
          }}
        >
          {emoji}
        </button>
      ))}
    </div>
  );

  return createPortal(content, document.body);
}

export default function TableRing({
  gameState,
  children,
  onSendReaction,
  reactionsByPlayerId,
  canShowReactions = false,
  isReactionCooldownActive = false,
}) {
  const areaRef = useRef(null);
  const [metrics, setMetrics] = useState({ width: 0, height: 0, seatWidth: 0, seatHeight: 0 });
  const reactionBtnElsRef = useRef({});
  const [openReaction, setOpenReaction] = useState(null); // { playerId, anchorRect }

  const players = gameState?.players ?? [];
  const myPlayerId = gameState?.myPlayerId ?? null;
  const turnPlayerId = gameState?.turnPlayerId ?? null;
  const turnIndexRaw = typeof gameState?.turnIndex === 'number' ? gameState.turnIndex : 0;
  const direction = gameState?.direction === -1 ? -1 : 1;

  // useEffect(() => {
  //   if (!import.meta?.env?.DEV) return;
  //   console.log('[UNO][client][DBG] TableRing', {
  //     players: Array.isArray(players) ? players.length : 0,
  //     canShowReactions,
  //   });
  // }, [players?.length, canShowReactions]);

  useEffect(() => {
    if (!openReaction?.playerId) return undefined;

    const onPointerDownCapture = (e) => {
      const target = e?.target;
      if (target && target.closest) {
        if (target.closest('.uno-reaction-popover') || target.closest('.uno-reaction-btn')) return;
      }
      setOpenReaction(null);
    };

    const onKeyDown = (e) => {
      if (e?.key === 'Escape') setOpenReaction(null);
    };

    document.addEventListener('pointerdown', onPointerDownCapture, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDownCapture, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openReaction?.playerId]);

  useLayoutEffect(() => {
    const playerId = openReaction?.playerId;
    if (!playerId) return undefined;
    const el = reactionBtnElsRef.current?.[playerId] || null;
    if (!el) return undefined;

    const update = () => {
      const rect = el.getBoundingClientRect();
      setOpenReaction((prev) =>
        prev && prev.playerId === playerId ? { ...prev, anchorRect: rect } : prev,
      );
    };

    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [openReaction?.playerId]);

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
      const idx = players.findIndex((p) => String(p?.id ?? '') === String(turnPlayerId));
      return idx >= 0 ? idx : turnIndexRaw;
    })();

    const ordered = buildSeats(players, myPlayerId);
    const n = Math.max(1, ordered.length);
    const step = n > 0 ? -TWO_PI / n : 0;
    const nextIndex = n > 0 ? (resolvedTurnIndex + direction + n) % n : 0;

    const hasSize = metrics.width > 0 && metrics.height > 0;
    const seatWidth = metrics.seatWidth > 0 ? metrics.seatWidth : DEFAULT_SEAT_W;
    const seatHeight = metrics.seatHeight > 0 ? metrics.seatHeight : DEFAULT_SEAT_H;

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
      const left = hasSize ? metrics.width / 2 + dx * radiusX : 50 + dx * radiusX;
      const top = hasSize ? metrics.height / 2 + dy * radiusY : 50 + dy * radiusY;

      return {
        key: player?.id ?? `${seatIndex}`,
        style: hasSize ? { left: `${left}px`, top: `${top}px` } : { left: `${left}%`, top: `${top}%` },
        player,
        cardCount: player?.handCount ?? player?.hand?.length ?? 0,
        isTurn: originalIndex === resolvedTurnIndex,
        isNext: originalIndex === nextIndex,
        isLocal: myPlayerId != null && player?.id === myPlayerId,
        reactionSide: resolveInboardSide(dx, dy),
        bubbleSide: dx < -0.25 ? 'right' : 'left',
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
      <div className="uno-table-seats" aria-label="Mesa">
        {seats.map((seat) => {
          const playerId = seat.player?.id == null ? '' : String(seat.player.id);
          const reaction = playerId ? reactionsByPlayerId?.[playerId] ?? null : null;

          return (
            <div
              key={seat.key}
              className="uno-seat-pos seat"
              style={seat.style}
              data-reaction-side={seat.reactionSide}
            >
              <div className="uno-seat-wrap" data-bubble-side={seat.bubbleSide}>
                <ReactionOverlay reaction={reaction} />

                <PlayerBadge
                  player={seat.player}
                  cardCount={seat.cardCount}
                  isTurn={seat.isTurn}
                  isNext={seat.isNext}
                  isLocal={seat.isLocal}
                />

                {/* Reactions (emoji button outside the badge + popover in portal) */}
                {typeof onSendReaction === 'function' &&
                  canShowReactions &&
                  !!seat.player &&
                  !seat.isLocal &&
                  !seat.player?.isBot && (
                    <>
                      <button
                        type="button"
                        className="uno-reaction-btn"
                        aria-label={`Enviar reaccion a ${seat.player?.name ?? 'Jugador'}`}
                        title="Reaccionar"
                        disabled={isReactionCooldownActive}
                        ref={(el) => {
                          if (!playerId) return;
                          if (el) reactionBtnElsRef.current[playerId] = el;
                          else delete reactionBtnElsRef.current[playerId];
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!playerId) return;
                          const anchorRect = e.currentTarget.getBoundingClientRect();
                          setOpenReaction((prev) =>
                            prev?.playerId === playerId ? null : { playerId, anchorRect },
                          );
                        }}
                      >
                        {'\u{1F642}'}
                      </button>

                      {openReaction?.playerId != null &&
                        openReaction.playerId === playerId && (
                          <ReactionPopover
                            anchorRect={openReaction.anchorRect}
                            preferredSide="right"
                            disabled={isReactionCooldownActive}
                            onSelect={(emoji) => {
                              onSendReaction(playerId, emoji);
                              setOpenReaction(null);
                            }}
                          />
                        )}
                    </>
                  )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="uno-table-center">
        <div className="uno-table-center-inner">{children}</div>
      </div>
    </div>
  );
}
