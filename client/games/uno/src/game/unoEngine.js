
export const COLORS = ['red', 'green', 'blue', 'yellow'];
export const VALUES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

// cartas especiales por color
export const SPECIAL_VALUES = ['skip', '+2'];

// Crea una carta con id único
function createCard(color, value) {
  return {
    id: `${color}-${value}-${Math.random().toString(36).slice(2)}`,
    color,
    value, // '0'-'9', 'skip', '+2'
  };
}

// Crea un mazo tipo UNO simplificado
// - Números: 1x "0" por color, 2x de cada 1–9 por color
// - Especiales: 2x 'skip' y 2x '+2' por color
function createDeck() {
  const deck = [];

  for (const color of COLORS) {
    // números
    for (const value of VALUES) {
      deck.push(createCard(color, value));
      if (value !== '0') {
        deck.push(createCard(color, value));
      }
    }

    // especiales
    for (const special of SPECIAL_VALUES) {
      deck.push(createCard(color, special));
      deck.push(createCard(color, special));
    }
  }

  return shuffle(deck);
}

// Barajado Fisher-Yates
function shuffle(array) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Regla básica: se puede jugar si coincide color o valor (incluye especiales)
export function canPlayCard(card, topCard) {
  if (!card || !topCard) return false;
  return card.color === topCard.color || card.value === topCard.value;
}

// Crea el estado inicial de la partida
export function createInitialGame() {
  let deck = createDeck();

  const playerHand = deck.slice(0, 7);
  const botHand = deck.slice(7, 14);
  let drawPile = deck.slice(14);

  // Primera carta en la mesa (intentamos que no sea especial, por simplicidad)
  let firstCard = drawPile.shift();
  while ((firstCard.value === 'skip' || firstCard.value === '+2') && drawPile.length > 0) {
    // meter la especial al mazo de abajo y sacar otra
    drawPile.push(firstCard);
    firstCard = drawPile.shift();
  }

  const discardPile = [firstCard];

  return {
    drawPile,
    discardPile,
    players: [
      { id: 0, name: 'Tú', hand: playerHand },
      { id: 1, name: 'Bot', hand: botHand },
    ],
    currentPlayerIndex: 0, // 0 = tú, 1 = bot
    status: 'playing',     // 'playing' | 'won' | 'lost'
    message: '',
  };
}