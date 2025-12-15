import React from 'react';

export default function GameResultModal({ status, onRestart }) {
  const isWin = status === 'won';
  const title = isWin ? '¡Has ganado!' : 'Has perdido';
  const emoji = isWin ? '🎉' : '💀';
  const subtitle = isWin
    ? 'Te has quedado sin cartas antes que el bot.'
    : 'El bot se ha quedado sin cartas antes que tú.';

  return (
    <div className="uno-modal-backdrop">
      <div className="uno-modal">
        <div className="uno-modal__emoji">{emoji}</div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
        <button onClick={onRestart}>Jugar otra vez</button>
      </div>
    </div>
  );
}