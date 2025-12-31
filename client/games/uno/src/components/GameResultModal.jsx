import React from 'react';

export default function GameResultModal({
  status,
  engine = null,
  onRestart,
  isMultiplayer = false,
  rematch = null,
}) {
  const isWin = status === 'won';
  const isTie = status === 'tied';

  const title = isTie ? 'Empate' : isWin ? '¡Has ganado!' : 'Has perdido';

  const finishReason = engine?.finishReason ?? null;
  const maxHandRaw = engine?.maxHand ?? engine?.lastAction?.maxHand ?? null;
  const maxHand = Number.isFinite(maxHandRaw) && maxHandRaw > 0 ? maxHandRaw : 40;

  const players = Array.isArray(engine?.players) ? engine.players : [];
  const winnerIndexes =
    Array.isArray(engine?.winnerIndexes) && engine.winnerIndexes.length > 0
      ? engine.winnerIndexes
      : Number.isInteger(engine?.winnerIndex)
        ? [engine.winnerIndex]
        : [];
  const loserIndexes =
    Array.isArray(engine?.loserIndexes) && engine.loserIndexes.length > 0
      ? engine.loserIndexes
      : players.map((_, idx) => idx).filter((idx) => !winnerIndexes.includes(idx));

  const nameForIndex = (idx) => players[idx]?.name ?? `Jugador ${idx + 1}`;
  const winnerNames = winnerIndexes.map(nameForIndex);
  const loserNames = loserIndexes.map(nameForIndex);

  const subtitle =
    finishReason === 'max_hand'
      ? `Motivo: Límite de ${maxHand} cartas alcanzado.`
      : isMultiplayer
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
        <h2>{title}</h2>
        <p>{subtitle}</p>

        {winnerNames.length > 0 && (
          <div className="uno-modal__outcome">
            {winnerNames.length > 1 ? (
              <p>
                <strong>Empate.</strong> Ganadores: {winnerNames.join(', ')}
              </p>
            ) : (
              <p>
                <strong>Ganador:</strong> {winnerNames[0]}
              </p>
            )}
            {loserNames.length > 0 && (
              <p>
                <strong>Perdedores:</strong> {loserNames.join(', ')}
              </p>
            )}
          </div>
        )}

        <div className="uno-modal__actions">
          <button
            className="uno-btn"
            onClick={onRestart}
            disabled={isMultiplayer && isReady}
          >
            {isMultiplayer && isReady ? 'Listo' : 'Jugar otra vez'}
          </button>
        </div>

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

