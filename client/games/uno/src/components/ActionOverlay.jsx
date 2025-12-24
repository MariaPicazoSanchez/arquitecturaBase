import React from 'react';
import { createPortal } from 'react-dom';

function effectText(effect) {
  if (!effect) return '';
  if (effect.type === '+2') return '+2';
  if (effect.type === '+4') return '+4';
  if (effect.type === 'SKIP') return 'SKIP';
  if (effect.type === 'REVERSE') return 'REVERSE';
  if (effect.type === 'WILD') return 'WILD';
  if (effect.type === 'UNO') return 'UNO!';
  return String(effect.type || '');
}

export default function ActionOverlay({ effect }) {
  if (!effect) return null;

  const text = effectText(effect);
  const color = effect.color;

  const node = (
    <div className="uno-action-overlay" aria-live="polite">
      <div className="uno-action-overlay-card">
        <div className="uno-action-overlay-text">{text}</div>
        {color && <div className={`uno-action-overlay-color uno-action-overlay-color--${color}`} />}
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(node, document.body) : node;
}
