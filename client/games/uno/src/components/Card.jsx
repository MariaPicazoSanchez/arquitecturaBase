import React from 'react';

const COLOR_MAP = {
  red: '#f97373',
  green: '#4ade80',
  blue: '#60a5fa',
  yellow: '#facc15',
};

const COLOR_LABEL = {
  red: 'rojo',
  green: 'verde',
  blue: 'azul',
  yellow: 'amarillo',
  wild: 'comodín',
};

function getCardTooltip(card) {
  if (!card) return '';
  const value = String(card.value ?? '');
  const color = String(card.color ?? '');

  if (/^\d+$/.test(value)) {
    return `Número ${value} — Color ${COLOR_LABEL[color] ?? color}`;
  }

  if (value === 'skip') return 'Salta el turno del siguiente jugador.';
  if (value === 'reverse') return 'Cambia el sentido de juego.';
  if (value === '+2') return 'El siguiente roba 2 y pierde el turno.';
  if (value === 'wild') {
    const chosen = color !== 'wild' ? ` (color elegido: ${COLOR_LABEL[color] ?? color})` : '';
    return `Comodín: elige un color.${chosen}`;
  }
  if (value === '+4' || value === '+6' || value === '+8') {
    const n = value === '+4' ? 4 : value === '+6' ? 6 : 8;
    const chosen = color !== 'wild' ? ` (color elegido: ${COLOR_LABEL[color] ?? color})` : '';
    return `Comodín +${n}: elige un color. El siguiente roba ${n} y pierde el turno.${chosen}`;
  }
  if (value === 'double') {
    return 'Double (x2): el siguiente roba tantas cartas como tenga en ese momento y pierde el turno.';
  }
  if (value === 'swap') return 'Intercambia tu mano con otro jugador y elige color.';
  if (value === 'discard_all') return 'Elige un color y descartas todas las cartas de ese color.';
  if (value === 'skip_all') return 'Saltas a todos y juegas otra vez.';

  return `${value} — Color ${COLOR_LABEL[color] ?? color}`;
}

export default function Card({
  card,
  onClick,
  disabled,
  size = 'normal',
  isPlayable = false,
  isLastPlayed = false,
}) {
  const isWildType =
    card.value === 'wild' ||
    card.value === '+4' ||
    card.value === 'swap' ||
    card.value === 'discard_all' ||
    card.value === 'skip_all' ||
    card.value === '+6' ||
    card.value === '+8';

  let displayValue = card.value;
  if (card.value === 'skip') displayValue = '⏭';
  else if (card.value === 'reverse') displayValue = '↻';
  else if (card.value === 'wild') displayValue = '★';
  else if (card.value === 'double') displayValue = '×2';
  else if (card.value === 'swap') displayValue = '⇄';
  else if (card.value === 'discard_all') displayValue = '✖';
  else if (card.value === 'skip_all') displayValue = '⦸';

  const classes = [
    'uno-card',
    size === 'large' && 'uno-card--large',
    disabled && 'uno-card--disabled',
    isPlayable && 'uno-card--playable',
    isLastPlayed && 'uno-card--last-played',
    isWildType && 'uno-card--wild',
  ]
    .filter(Boolean)
    .join(' ');

  const baseColor = COLOR_MAP[card.color];

  let innerStyle;

  if (isWildType) {
    if (card.color === 'wild') {
      innerStyle = {
        background:
          'conic-gradient(from 45deg, #ef4444, #facc15, #22c55e, #3b82f6, #ef4444)',
      };
    } else {
      innerStyle = {
        background:
          `radial-gradient(circle at 30% 20%, rgba(248,250,252,0.55), transparent 55%),` +
          `radial-gradient(circle at 70% 80%, rgba(15,23,42,0.4), transparent 60%),` +
          `linear-gradient(135deg, ${baseColor || '#e5e7eb'}, ${baseColor || '#e5e7eb'})`,
      };
    }
  } else {
    innerStyle = {
      background:
        `radial-gradient(circle at 30% 20%, rgba(248,250,252,0.55), transparent 55%),` +
        `radial-gradient(circle at 70% 80%, rgba(15,23,42,0.4), transparent 60%),` +
        `linear-gradient(135deg, ${baseColor || '#e5e7eb'}, ${baseColor || '#e5e7eb'})`,
    };
  }

  return (
    <div
      className={classes}
      onClick={disabled ? undefined : onClick}
      title={getCardTooltip(card)}
    >
      <div className="uno-card__inner" style={innerStyle}>
        <div className="uno-card__corner uno-card__corner--tl">
          {displayValue}
        </div>

        <div className="uno-card__center">{displayValue}</div>

        <div className="uno-card__corner uno-card__corner--br">
          {displayValue}
        </div>
      </div>
    </div>
  );
}
