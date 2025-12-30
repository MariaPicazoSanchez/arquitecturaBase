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
    return `Número ${value} · Color ${COLOR_LABEL[color] ?? color}`;
  }

  if (value === 'skip') return 'Salta el turno del siguiente jugador.';
  if (value === 'reverse') return 'Cambia el sentido de juego.';
  if (value === '+2') return 'El siguiente roba 2 y pierde el turno.';
  if (value === '+6') return 'El siguiente roba 6 y pierde el turno.';
  if (value === '+8') return 'El siguiente roba 8 y pierde el turno.';

  if (value === 'wild') {
    const chosen =
      color !== 'wild' ? ` (color elegido: ${COLOR_LABEL[color] ?? color})` : '';
    return `Comodín: elige un color.${chosen}`;
  }

  if (value === '+4') {
    const chosen =
      color !== 'wild' ? ` (color elegido: ${COLOR_LABEL[color] ?? color})` : '';
    return `Comodín +4: elige un color. El siguiente roba 4 y pierde el turno.${chosen}`;
  }

  if (value === 'double') {
    return 'Double (x2): el siguiente roba tantas cartas como tenga en ese momento y pierde el turno.';
  }
  if (value === 'swap') return 'Intercambia tu mano con otro jugador y elige color.';
  if (value === 'discard_all') return 'Elige un color y descartas todas las cartas de ese color.';
  if (value === 'skip_all') return 'Saltas a todos y juegas otra vez.';

  return `${value} · Color ${COLOR_LABEL[color] ?? color}`;
}

export default function Card({
  card,
  onClick,
  disabled,
  size = 'normal',
  isPlayable = false,
  isLastPlayed = false,
}) {
  const isWildValue = card.value === 'wild' || card.value === '+4';
  const isPlusFour = card.value === '+4';
  const isColorlessSpecial = card.color === 'wild';

  let displayValue = card.value;
  if (card.value === 'skip') displayValue = '⏭';
  else if (card.value === 'reverse') displayValue = '↺';
  else if (card.value === 'wild') displayValue = 'W';
  else if (card.value === 'double') displayValue = 'x2';
  else if (card.value === 'swap') displayValue = 'SWAP';
  else if (card.value === 'discard_all') displayValue = 'ALL';
  else if (card.value === 'skip_all') displayValue = 'SKIP';

  const classes = [
    'uno-card',
    size === 'large' && 'uno-card--large',
    disabled && 'uno-card--disabled',
    isPlayable && 'uno-card--playable',
    isLastPlayed && 'uno-card--last-played',
    isWildValue && 'uno-card--wild',
    isPlusFour && 'uno-card--plus4',
  ]
    .filter(Boolean)
    .join(' ');

  const baseColor = COLOR_MAP[card.color];
  const solidColor = baseColor || (isColorlessSpecial ? '#111827' : '#e5e7eb');

  const rainbow =
    'linear-gradient(135deg, #ef4444 0 25%, #facc15 25% 50%, #22c55e 50% 75%, #3b82f6 75% 100%)';
  const chosenSolid =
    card.color && card.color !== 'wild' && COLOR_MAP[card.color]
      ? `linear-gradient(90deg, ${COLOR_MAP[card.color]} 0 100%)`
      : null;

  const wildBar = chosenSolid ?? 'linear-gradient(90deg, #ef4444 0 25%, #facc15 25% 50%, #22c55e 50% 75%, #3b82f6 75% 100%)';

  const innerStyle = isWildValue
    ? isPlusFour
      ? {
          backgroundColor: '#111827',
          backgroundImage: rainbow,
          backgroundRepeat: 'no-repeat',
          backgroundSize: '100% 100%',
          backgroundPosition: 'center',
        }
      : {
          backgroundColor: '#111827',
          backgroundImage: wildBar,
          backgroundRepeat: 'no-repeat',
          backgroundSize: '100% 10px',
          backgroundPosition: 'top',
        }
    : {
        backgroundColor: solidColor,
        backgroundImage:
          'linear-gradient(180deg, rgba(255,255,255,0.22), rgba(0,0,0,0.10))',
      };

  return (
    <div
      className={classes}
      onClick={disabled ? undefined : onClick}
      title={getCardTooltip(card)}
    >
      <div className="uno-card__inner" style={innerStyle}>
        <div className="uno-card__corner uno-card__corner--tl">{displayValue}</div>
        <div className="uno-card__center">{displayValue}</div>
        <div className="uno-card__corner uno-card__corner--br">{displayValue}</div>
      </div>
    </div>
  );
}
