import React from 'react';

function getInitial(name) {
  const t = (name || '').trim();
  if (!t) return '?';
  return t[0].toUpperCase();
}

export default function PlayerBadge({
  player,
  cardCount = 0,
  isTurn = false,
  isNext = false,
  isLocal = false,
}) {
  const rawName = player?.name ?? 'Jugador';
  const safeName = String(rawName).includes('@') ? 'Jugador' : rawName;

  const classes = [
    'playerBadge',
    'uno-seat',
    isTurn ? 'active' : 'inactive',
    isTurn && 'turn',
    isTurn && 'uno-seat--active',
    isLocal && 'uno-seat--local',
  ]
    .filter(Boolean)
    .join(' ');

  const youLabel = `T\u00da`;
  const saidUno = !!(player?.hasSaidUno || player?.hasCalledUno);
  const showUno = saidUno && Number(cardCount) === 1;
  const isBot = !!player?.isBot;
  const isConnected = player?.isConnected;
  const displayCount = isConnected === false ? '—' : cardCount;

  return (
    <div className={classes}>
      <div className="playerBadgeRow">
        <div className="playerBadgeAvatar" aria-hidden="true">
          {getInitial(safeName)}
        </div>

        <div className="playerBadgeMeta">
          {/* split name + count so count never gets ellipsized */}
          <div className="playerBadgeTopRow">
            <span className="playerBadgeName" title={safeName}>
              {safeName}
            </span>
            <span className="playerBadgeCountInline">({displayCount})</span>
            {isLocal && <span className="playerBadgeYou">{youLabel}</span>}
          </div>
        </div>

        <div className="playerBadgeChips">
          {isBot && <span className="playerBadgeChip">BOT</span>}
          {isConnected === false && (
            <span className="playerBadgeChip" title="Sin conexión">
              OFF
            </span>
          )}
          {showUno && <span className="playerBadgeChip">UNO</span>}
          {isTurn && <span className="playerBadgeChip playerBadgeChip--turn">TURNO</span>}
          {!isTurn && isNext && (
            <span className="playerBadgeChip playerBadgeChip--next">SIGUIENTE</span>
          )}
        </div>
      </div>
    </div>
  );
}
