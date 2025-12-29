// Utilidades puras para operaciones sobre mazo/descarte.

export function shuffle(array) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const WILD_VALUES = new Set(['wild', '+4', '+6', '+8', 'swap', 'discard_all', 'skip_all']);

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

  const top = safeDiscard[safeDiscard.length - 1];
  const recycle = safeDiscard.slice(0, -1);

  const normalizedRecycle = recycle.map((c) => (WILD_VALUES.has(c.value) ? { ...c, color: 'wild' } : c));

  // eslint-disable-next-line no-console
  console.log('[UNO] rebuild deck', { recycle: normalizedRecycle.length, top: top?.value, topColor: top?.color });

  return {
    rebuilt: true,
    deck: shuffle(normalizedRecycle),
    discard: [top],
  };
}

