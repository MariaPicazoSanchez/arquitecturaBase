// Utilidades puras para operaciones sobre mazo/descarte.

export function shuffle(array) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const COLORLESS_VALUES = new Set(['wild', '+4']);

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

  const normalizedRecycle = recycle.map((c) =>
    COLORLESS_VALUES.has(c.value) ? { ...c, color: 'wild' } : c,
  );

  const shouldDebug =
    typeof window !== 'undefined' &&
    window?.localStorage?.getItem &&
    window.localStorage.getItem('UNO_DEBUG_WILDS') === '1';
  if (shouldDebug) {
    const wildCount = normalizedRecycle.filter((c) => c?.value === 'wild').length;
    const plus4Count = normalizedRecycle.filter((c) => c?.value === '+4').length;
    // eslint-disable-next-line no-console
    console.log('[UNO] rebuild deck', {
      recycle: normalizedRecycle.length,
      top: top?.value,
      topColor: top?.color,
      wild: wildCount,
      plus4: plus4Count,
    });
  }

  return {
    rebuilt: true,
    deck: shuffle(normalizedRecycle),
    discard: [top],
  };
}
