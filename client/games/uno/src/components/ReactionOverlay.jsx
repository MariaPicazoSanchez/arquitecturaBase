import React from 'react';

export default function ReactionOverlay({ reaction }) {
  if (!reaction) return null;

  const fromName = reaction?.fromName ?? 'Jugador';
  const emoji = reaction?.emoji ?? reaction?.icon ?? '';

  return (
    <div className="uno-reaction-overlay" aria-live="polite" aria-atomic="true">
      <div className="uno-reaction-emoji" aria-hidden="true">
        {emoji}
      </div>
      <div className="uno-reaction-from">{`De: ${fromName}`}</div>
    </div>
  );
}

