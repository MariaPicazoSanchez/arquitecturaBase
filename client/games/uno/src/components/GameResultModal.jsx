import React from 'react';

export default function GameResultModal({
  status,
  onRestart,
  isMultiplayer = false,
  rematch = null,
}) {
  const isWin = status === 'won';
  const title = isWin ? '¡Has ganado!' : 'Has perdido';
  const emoji = isWin ? '🏆' : '😢';
  const subtitle = isMultiplayer
    ? 'Partida terminada.'
    : isWin
      ? 'Te has quedado sin cartas antes que el bot.'
      : 'El bot se ha quedado sin cartas antes que tú.';

  const readyCount = Number(rematch?.readyCount ?? 0);
  const totalCount = Number(rematch?.totalCount ?? 0);
  const isReady = !!rematch?.isReady;
  const waitingCount =
    Number.isFinite(totalCount) && totalCount > 0
      ? Math.max(0, totalCount - readyCount)
      : null;

  return (
    <div className="uno-modal-backdrop">
      <div className="uno-modal">
        <div className="uno-modal__emoji">{emoji}</div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
        <button onClick={onRestart} disabled={isMultiplayer && isReady}>
          {isMultiplayer && isReady ? 'Listo ✅' : 'Jugar otra vez'}
        </button>
        {isMultiplayer && Number.isFinite(totalCount) && totalCount > 0 && (
          <p style={{ marginTop: '0.75rem', opacity: 0.9 }}>
            {readyCount}/{totalCount} listos
            {waitingCount != null && waitingCount > 0
              ? ` · Esperando a ${waitingCount} jugador(es)…`
              : ' · Empezando…'}
          </p>
        )}
      </div>
    </div>
  );
}
