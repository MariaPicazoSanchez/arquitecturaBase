import React from 'react';

function getInitial(name) {
  const t = (name || '').trim();
  if (!t) return '?';
  return t[0].toUpperCase();
}

export default function PlayerSeat({
  player,
  isLocal = false,
  isActive = false,
  isLost = false,
  cardCount = 0,
  showCardBacks = true,
  unoSecondsRemaining = null,
  unoProgress = null,
}) {
  const maxBacks = 6;
  const visibleBacks = Math.min(cardCount, maxBacks);
  const showCountBadge = cardCount > maxBacks;

  const classes = [
    'uno-seat',
    isLocal && 'uno-seat--local',
    isActive && 'uno-seat--active',
    isLost && 'uno-seat--lost',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      {isActive && <div className="uno-seat-arrow" aria-hidden="true" />}

      <div className="uno-seat-header">
        <div className="uno-seat-avatar" aria-hidden="true">
          {getInitial(player?.name)}
        </div>

        <div className="uno-seat-meta">
          <div className="uno-seat-name">{player?.name ?? 'Jugador'}</div>
          <div className="uno-seat-count">
            {isLost ? 'PERDIÓ' : `${cardCount} ${cardCount === 1 ? 'carta' : 'cartas'}`}
          </div>
        </div>

        {isLocal && isActive && (
          <div className="uno-seat-turn-badge" aria-label="Tu turno">
            TU TURNO
          </div>
        )}
      </div>

      {showCardBacks && (
        <div className="uno-seat-cards" aria-hidden="true">
          {Array.from({ length: visibleBacks }).map((_, i) => {
            const spread = visibleBacks <= 1 ? 0 : 18;
            const angle = visibleBacks <= 1 ? 0 : -spread / 2 + (spread * i) / (visibleBacks - 1);
            const offsetY = Math.abs(i - (visibleBacks - 1) / 2) * 1.2;

            return (
              <div
                key={i}
                className="uno-seat-cardback"
                style={{
                  transform: `translateX(${i * 5}px) translateY(${offsetY}px) rotate(${angle}deg)`,
                  zIndex: i,
                }}
              />
            );
          })}
          {showCountBadge && <div className="uno-seat-cardback-count">x{cardCount}</div>}
        </div>
      )}

      {unoSecondsRemaining != null && unoSecondsRemaining > 0 && (
        <div className="uno-seat-uno">
          <div className="uno-seat-uno-label">UNO en {unoSecondsRemaining}s</div>
          {typeof unoProgress === 'number' && (
            <div className="uno-seat-uno-bar" aria-hidden="true">
              <div
                className="uno-seat-uno-bar-fill"
                style={{ transform: `scaleX(${Math.max(0, Math.min(1, unoProgress))})` }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

