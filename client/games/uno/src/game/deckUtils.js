// Utilidades puras para operaciones sobre mazo/descarte.

export function shuffle(array) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Regla: si el mazo queda vacío, mantener la última carta del descarte en mesa
// y barajar el resto para crear un nuevo mazo.
export function rebuildDeckIfNeeded({ deck, discard }) {
  const safeDeck = Array.isArray(deck) ? deck : [];
  const safeDiscard = Array.isArray(discard) ? discard : [];

  if (safeDeck.length > 0) {
    return { deck: [...safeDeck], discard: [...safeDiscard], rebuilt: false };
  }

  // Sin cartas suficientes para reconstruir (solo queda la carta superior).
  if (safeDiscard.length <= 1) {
    return { deck: [...safeDeck], discard: [...safeDiscard], rebuilt: false };
  }

  const topCard = safeDiscard[safeDiscard.length - 1];
  const toRecycle = safeDiscard.slice(0, -1);
  const newDeck = shuffle(toRecycle);
  const newDiscard = [topCard];

  return { deck: newDeck, discard: newDiscard, rebuilt: true };
}

