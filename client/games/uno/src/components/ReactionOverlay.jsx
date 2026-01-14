import React from 'react';

export default function ReactionOverlay({ reaction }) {
  if (!reaction) return null;

  const fromName = reaction?.fromName ?? 'Jugador';
  const icon = reaction?.icon ?? '';

  return (
    <div className="uno-reaction-overlay" aria-live="polite" aria-atomic="true">
      <div className="uno-reaction-bubble">
        <div className="uno-reaction-icon" aria-hidden="true">
          {icon}
        </div>
        <div className="uno-reaction-from">{`Enviado por ${fromName}`}</div>
      </div>
    </div>
  );
}

