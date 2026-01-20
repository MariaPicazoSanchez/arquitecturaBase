import React, { useMemo } from 'react';
import PlayerSeat from './PlayerSeat';

const TWO_PI = Math.PI * 2;
const BASE_ANGLE = Math.PI / 2; // abajo

export default function TableLayout({
  players,
  activePlayerIndex,
  localPlayerId,
  lostPlayerIds = [],
  unoDeadlinesByPlayerId = {},
  unoWindowMs,
  nowTs,
  children,
}) {
  const n = Math.max(1, Math.min(players?.length ?? 0, 8));
  const seats = useMemo(() => {
    // Posiciones fijas en las orillas de la mesa
    const edgePositions = [
      { left: '50%', top: '96%' },    // 0: abajo centro (jugador local)
      { left: '8%', top: '50%' },     // 1: izquierda centro
      { left: '50%', top: '4%' },     // 2: arriba centro
      { left: '92%', top: '50%' },    // 3: derecha centro
      { left: '15%', top: '88%' },    // 4: abajo izquierda
      { left: '15%', top: '12%' },    // 5: arriba izquierda
      { left: '85%', top: '12%' },    // 6: arriba derecha
      { left: '85%', top: '88%' },    // 7: abajo derecha
    ];
    
    return (players ?? []).slice(0, 8).map((p, idx) => {
      const position = edgePositions[idx] || edgePositions[0];
      return {
        player: p,
        idx,
        style: position,
      };
    });
  }, [players, n]);

  return (
    <div className="uno-table-area">
      <div className="uno-table-seats" aria-label="Mesa">
        {seats.map(({ player, idx, style }) => {
          const isActive = idx === activePlayerIndex;
          const isLost = lostPlayerIds.includes(player?.id);
          const isLocal = player?.id === localPlayerId;

          const deadline =
            unoDeadlinesByPlayerId?.[player?.id] ??
            unoDeadlinesByPlayerId?.[String(player?.id)] ??
            null;

          const remainingMs = deadline != null && nowTs != null ? deadline - nowTs : null;
          const unoSecondsRemaining =
            remainingMs != null && remainingMs > 0 ? Math.ceil(remainingMs / 1000) : null;
          const unoProgress =
            remainingMs != null && remainingMs > 0 && typeof unoWindowMs === 'number' && unoWindowMs > 0
              ? remainingMs / unoWindowMs
              : null;

          return (
            <div key={player?.id ?? idx} className="uno-seat-pos" style={style}>
              <PlayerSeat
                player={player}
                isLocal={isLocal}
                isActive={isActive}
                isLost={isLost}
                cardCount={player?.hand?.length ?? 0}
                showCardBacks={!isLocal}
                unoSecondsRemaining={unoSecondsRemaining}
                unoProgress={unoProgress}
              />
            </div>
          );
        })}
      </div>

      <div className="uno-table-center">{children}</div>
    </div>
  );
}
