import React from 'react';

const COLOR_MAP = {
  red: '#f97373',
  green: '#4ade80',
  blue: '#60a5fa',
  yellow: '#facc15',
};

export default function Card({
  card,
  onClick,
  disabled,
  size = 'normal',
  isPlayable = false,
  isLastPlayed = false,
}) {
  const isWildType = card.value === 'wild' || card.value === '+4';

  let displayValue = card.value;
  if (card.value === 'skip') displayValue = '⏭';
  else if (card.value === 'reverse') displayValue = '↺';
  else if (card.value === 'wild') displayValue = '★';

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

  // 🔹 Caso 1: carta normal o comodín ya con color elegido
  const baseColor = COLOR_MAP[card.color];

  let innerStyle;

  if (isWildType) {
    if (card.color === 'wild') {
      // 🔸 Comodín en la mano (sin color decidido): multicolor
      innerStyle = {
        background:
          'conic-gradient(from 45deg, #ef4444, #facc15, #22c55e, #3b82f6, #ef4444)',
      };
    } else {
      // 🔸 Comodín ya jugado: usa el color elegido
      innerStyle = {
        background:
          `radial-gradient(circle at 30% 20%, rgba(248,250,252,0.55), transparent 55%),` +
          `radial-gradient(circle at 70% 80%, rgba(15,23,42,0.4), transparent 60%),` +
          `linear-gradient(135deg, ${baseColor || '#e5e7eb'}, ${baseColor || '#e5e7eb'})`,
      };
    }
  } else {
    // 🔸 Carta normal de color
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
