import React, { useEffect, useState, useRef } from 'react';
import Card from './Card';
import GameResultModal from './GameResultModal';
import { createUnoSocket } from '../network/unoSocket';
import {
  createInitialState,
  applyAction,
  ACTION_TYPES,
  getPlayableCards,
  getNextPlayerIndex,
  COLORS,
} from '../game/unoEngineMultiplayer';

export default function UnoGame() {
  const codigoFromUrl = new URLSearchParams(window.location.search).get('codigo');
  const isMultiplayer = !!codigoFromUrl;
  const unoNetRef = useRef(null);

  // Estado principal del juego (modo 1 vs Bot)
  const [game, setGame] = useState(() => ({
    engine: createInitialState({ numPlayers: 2, names: ['Tú', 'Bot'] }),
    uiStatus: 'playing',
    message:
      'Tu turno. Juega una carta que coincida en color, número o símbolo.',
  }));

  const [unoPrompt, setUnoPrompt] = useState(false);
  const unoTimeoutRef = useRef(null);
  const unoCalledRef = useRef(false);

  const [pendingWild, setPendingWild] = useState(null);
  const [showColorPicker, setShowColorPicker] = useState(false);

  const { engine, uiStatus } = game;
  const player = engine?.players?.[0] ?? null;
  const bot = engine?.players?.[1] ?? null;
  const isHumanTurn = engine?.currentPlayerIndex === 0;
  const isPlaying = uiStatus === 'playing';

  useEffect(() => {
    console.log('[UNO][client][DBG] mount', {
      search: window.location.search,
      players: engine?.players?.map((p) => p.name) ?? null,
    });
  }, []);

  useEffect(() => {
    console.log('[UNO][client][DBG] engine update', {
      players:
        engine?.players?.map((p) => ({
          id: p.id,
          name: p.name,
          cards: p.hand.length,
        })) ?? null,
      currentPlayerIndex: engine?.currentPlayerIndex ?? null,
      status: engine?.status ?? null,
      winnerIndex: engine?.winnerIndex ?? null,
      lastAction: engine?.lastAction ?? null,
    });
  }, [engine]);

  // ---------- helpers ----------

  const getCookieValue = (cookieStr, name) => {
    const parts = (cookieStr || '')
      .split(';')
      .map((p) => p.trim())
      .filter(Boolean);
    for (const part of parts) {
      const idx = part.indexOf('=');
      if (idx === -1) continue;
      const k = part.slice(0, idx);
      const v = part.slice(idx + 1);
      if (k === name) return decodeURIComponent(v);
    }
    return null;
  };

  const resolveNickOrEmail = () => {
    const localCookie = typeof document !== 'undefined' ? document.cookie : '';
    const direct =
      getCookieValue(localCookie, 'nick') || getCookieValue(localCookie, 'email');
    if (direct) return direct;

    try {
      const parentCookie = window.parent?.document?.cookie || '';
      return (
        getCookieValue(parentCookie, 'nick') ||
        getCookieValue(parentCookie, 'email') ||
        null
      );
    } catch {
      return null;
    }
  };

  const sendMultiplayerAction = (action) => {
    const api = unoNetRef.current;
    if (!api || typeof api.sendAction !== 'function') {
      console.warn('[UNO] sendAction no disponible todavía', action);
      return;
    }
    api.sendAction(action);
  };

  const clearUnoTimer = () => {
    if (unoTimeoutRef.current) {
      clearTimeout(unoTimeoutRef.current);
      unoTimeoutRef.current = null;
    }
    unoCalledRef.current = false;
    setUnoPrompt(false);
  };

  const startUnoTimer = () => {
    if (isMultiplayer) return;
    if (unoTimeoutRef.current) return;

    unoCalledRef.current = false;
    setUnoPrompt(true);

    unoTimeoutRef.current = setTimeout(() => {
      if (!unoCalledRef.current) {
        setGame((prev) => {
          const { engine, uiStatus } = prev;
          if (uiStatus !== 'playing') return prev;

          const players = engine.players.map((p) => ({
            ...p,
            hand: [...p.hand],
          }));
          const me = players[0];
          const botP = players[1];

          if (me.hand.length !== 1) return prev;

          // Pierdes: te llevas las cartas del bot
          me.hand = [...me.hand, ...botP.hand];
          botP.hand = [];

          const newEngine = {
            ...engine,
            players,
            status: 'finished',
            winnerIndex: 1,
          };

          return {
            ...prev,
            engine: newEngine,
            uiStatus: 'lost',
            message:
              '¡No has pulsado UNO! Te llevas todas las cartas del bot y pierdes la partida.',
          };
        });
      }

      setUnoPrompt(false);
      unoTimeoutRef.current = null;
    }, 4000);
  };

  const handleUnoClick = () => {
    if (!unoPrompt || uiStatus !== 'playing') return;
    unoCalledRef.current = true;
    clearUnoTimer();
    if (isMultiplayer) {
      sendMultiplayerAction({ type: ACTION_TYPES.CALL_UNO });
    }
    setGame((prev) => ({
      ...prev,
      message: '¡Has pulsado UNO a tiempo! 😎',
    }));
  };

  useEffect(
    () => () => {
      clearUnoTimer();
    },
    [],
  );

  // ---------- multiplayer (Socket.IO) ----------

  useEffect(() => {
    if (!isMultiplayer) return;

    const codigo = codigoFromUrl;
    const email = resolveNickOrEmail();

    console.log('[UNO][client][DBG] multiplayer init', {
      codigo,
      email,
      cookie: typeof document !== 'undefined' ? document.cookie : null,
    });

    setGame((prev) => ({
      ...prev,
      engine: null,
      uiStatus: 'waiting',
      message: 'Conectando a la partida...',
    }));

    if (!codigo) {
      setGame((prev) => ({
        ...prev,
        engine: null,
        uiStatus: 'waiting',
        message: 'Falta el código de partida en la URL.',
      }));
      return;
    }

    if (!email) {
      setGame((prev) => ({
        ...prev,
        engine: null,
        uiStatus: 'waiting',
        message:
          'No se pudo leer tu nick/email (cookie). Vuelve a la app e inicia sesión.',
      }));
      return;
    }

    const api = createUnoSocket({
      codigo,
      email,
      onState: (estado) => {
        const newEngine = estado && estado.engine;
        if (!newEngine) return;

        setGame((prev) => {
          let newUiStatus = prev.uiStatus;
          let message = prev.message;

          if (newEngine.status === 'finished') {
            newUiStatus = newEngine.winnerIndex === 0 ? 'won' : 'lost';
            const winnerName =
              newEngine.players?.[newEngine.winnerIndex]?.name ?? 'Oponente';
            message =
              newEngine.winnerIndex === 0
                ? '¡Te has quedado sin cartas! Has ganado.'
                : `${winnerName} se ha quedado sin cartas. Has perdido.`;
            clearUnoTimer();
          } else {
            newUiStatus = 'playing';
            const turnName =
              newEngine.players?.[newEngine.currentPlayerIndex]?.name ?? '—';
            message =
              newEngine.currentPlayerIndex === 0
                ? 'Tu turno.'
                : `Turno de ${turnName}...`;
          }

          return { ...prev, engine: newEngine, uiStatus: newUiStatus, message };
        });
      },
      onError: (err) => {
        console.error('[UNO] error WS', err);
        setGame((prev) => ({
          ...prev,
          engine: null,
          uiStatus: 'waiting',
          message: 'Error de conexión con el servidor.',
        }));
      },
    });

    unoNetRef.current = api;

    return () => {
      try {
        api.disconnect();
      } catch {}
      unoNetRef.current = null;
    };
  }, []);

  // ---------- helper: elegir color del bot ----------

  const chooseBotColor = (eng) => {
    const botHand = eng.players[1].hand;
    const counts = {
      red: 0,
      green: 0,
      blue: 0,
      yellow: 0,
    };

    for (const c of botHand) {
      if (COLORS.includes(c.color)) {
        counts[c.color]++;
      }
    }

    let bestColor = 'red';
    let bestCount = -1;
    for (const color of COLORS) {
      if (counts[color] > bestCount) {
        bestCount = counts[color];
        bestColor = color;
      }
    }
    return bestColor;
  };

  // ---------- última jugada (texto) ----------

  const renderLastAction = (lastAction) => {
    if (!lastAction) return 'Última jugada: —';

    const actor =
      engine.players?.[lastAction.playerIndex]?.name ??
      `Jugador ${lastAction.playerIndex + 1}`;

    if (lastAction.type === ACTION_TYPES.PLAY_CARD && lastAction.card) {
      const { color, value } = lastAction.card;
      let valueText = value;
      if (value === 'skip') valueText = '⏭';
      else if (value === 'reverse') valueText = '↺';
      else if (value === 'wild') valueText = '★';

      return `Última jugada: ${actor} jugó ${valueText} ${color}`;
    }

    if (lastAction.type === ACTION_TYPES.DRAW_CARD) {
      return `Última jugada: ${actor} robó carta`;
    }

    if (lastAction.type === ACTION_TYPES.CALL_UNO) {
      return `Última jugada: ${actor} declaró UNO`;
    }

    return 'Última jugada: —';
  };

  // ---------- Turno jugador humano ----------

  const handleCardClick = (card) => {
    if (!engine || !player) return;
    if (!isPlaying || !isHumanTurn) return;

    const hadCardsBefore = player.hand.length;

    // comodines necesitan elegir color
    if (card.value === 'wild' || card.value === '+4') {
      const playable = getPlayableCards(engine, 0);
      if (!playable.some((c) => c.id === card.id)) {
        setGame((prev) => ({
          ...prev,
          message:
            'Esa carta no se puede jugar. Debe coincidir en color, número, símbolo o ser comodín.',
        }));
        return;
      }
      setPendingWild({ cardId: card.id, hadCardsBefore });
      setShowColorPicker(true);
      return;
    }

    if (isMultiplayer) {
      const playable = getPlayableCards(engine, 0);
      if (!playable.some((c) => c.id === card.id)) {
        setGame((prev) => ({
          ...prev,
          message:
            'Esa carta no se puede jugar. Debe coincidir en color, número o símbolo.',
        }));
        return;
      }

      sendMultiplayerAction({
        type: ACTION_TYPES.PLAY_CARD,
        cardId: card.id,
      });
      return;
    }

    setGame((prev) => {
      const { engine, uiStatus } = prev;
      if (uiStatus !== 'playing') return prev;
      if (engine.currentPlayerIndex !== 0) return prev;

      const playable = getPlayableCards(engine, 0);
      if (!playable.some((c) => c.id === card.id)) {
        return {
          ...prev,
          message:
            'Esa carta no se puede jugar. Debe coincidir en color, número o símbolo.',
        };
      }

      const newEngine = applyAction(engine, {
        type: ACTION_TYPES.PLAY_CARD,
        playerIndex: 0,
        cardId: card.id,
      });

      let newUiStatus = prev.uiStatus;
      let message = '';

      if (newEngine.status === 'finished') {
        if (newEngine.winnerIndex === 0) {
          newUiStatus = 'won';
          message = '¡Te has quedado sin cartas! Has ganado 🎉';
        } else {
          newUiStatus = 'lost';
          message = 'El bot se ha quedado sin cartas. Has perdido 😭';
        }
        clearUnoTimer();
      } else {
        if (newEngine.currentPlayerIndex === 0) {
          message = 'Te toca de nuevo.';
        } else {
          message = 'Turno del bot...';
        }
      }

      return {
        ...prev,
        engine: newEngine,
        uiStatus: newUiStatus,
        message,
      };
    });

    if (hadCardsBefore === 2) {
      startUnoTimer();
    } else if (hadCardsBefore !== 1) {
      clearUnoTimer();
    }
  };

  const handleChooseWildColor = (color) => {
    if (!pendingWild) return;
    const { cardId, hadCardsBefore } = pendingWild;

    setPendingWild(null);
    setShowColorPicker(false);

    if (isMultiplayer) {
      window.location.reload();
      return;
    }

    if (isMultiplayer) {
      if (!engine) return;
      const playable = getPlayableCards(engine, 0);
      if (!playable.some((c) => c.id === cardId)) return;
      sendMultiplayerAction({
        type: ACTION_TYPES.PLAY_CARD,
        cardId,
        chosenColor: color,
      });
      return;
    }

    setGame((prev) => {
      const { engine, uiStatus } = prev;
      if (uiStatus !== 'playing') return prev;
      if (engine.currentPlayerIndex !== 0) return prev;

      const playable = getPlayableCards(engine, 0);
      if (!playable.some((c) => c.id === cardId)) return prev;

      const newEngine = applyAction(engine, {
        type: ACTION_TYPES.PLAY_CARD,
        playerIndex: 0,
        cardId,
        chosenColor: color,
      });

      let newUiStatus = prev.uiStatus;
      let message = '';

      if (newEngine.status === 'finished') {
        if (newEngine.winnerIndex === 0) {
          newUiStatus = 'won';
          message = '¡Te has quedado sin cartas! Has ganado 🎉';
        } else {
          newUiStatus = 'lost';
          message = 'El bot se ha quedado sin cartas. Has perdido 😭';
        }
        clearUnoTimer();
      } else {
        if (newEngine.currentPlayerIndex === 0) {
          message = 'Te toca de nuevo.';
        } else {
          message = 'Turno del bot...';
        }
      }

      return {
        ...prev,
        engine: newEngine,
        uiStatus: newUiStatus,
        message,
      };
    });

    if (hadCardsBefore === 2) {
      startUnoTimer();
    } else if (hadCardsBefore !== 1) {
      clearUnoTimer();
    }
  };

  const handleDrawCard = () => {
    if (!engine) return;
    if (!isPlaying || !isHumanTurn) return;

    clearUnoTimer();

    if (isMultiplayer) {
      if (engine.drawPile.length === 0) {
        setGame((prev) => ({
          ...prev,
          message: 'No quedan cartas en el mazo.',
        }));
        return;
      }
      sendMultiplayerAction({ type: ACTION_TYPES.DRAW_CARD });
      return;
    }

    setGame((prev) => {
      const { engine, uiStatus } = prev;
      if (uiStatus !== 'playing') return prev;
      if (engine.currentPlayerIndex !== 0) return prev;

      if (engine.drawPile.length === 0) {
        return {
          ...prev,
          message: 'No quedan cartas en el mazo.',
        };
      }

      const newEngine = applyAction(engine, {
        type: ACTION_TYPES.DRAW_CARD,
        playerIndex: 0,
      });

      return {
        ...prev,
        engine: newEngine,
        message: 'Has robado una carta. Si puedes, juega una.',
      };
    });
  };

  const handleRestart = () => {
    clearUnoTimer();
    setPendingWild(null);
    setShowColorPicker(false);

    setGame({
      engine: createInitialState({ numPlayers: 2, names: ['Tú', 'Bot'] }),
      uiStatus: 'playing',
      message:
        'Tu turno. Juega una carta que coincida en color, número o símbolo.',
    });
  };

  // ---------- Turno del bot ----------

  useEffect(() => {
    if (isMultiplayer) return;
    if (!engine) return;
    if (!isPlaying) return;
    if (engine.currentPlayerIndex !== 1) return;

    const timeout = setTimeout(() => {
      setGame((prev) => {
        const { engine, uiStatus } = prev;
        if (uiStatus !== 'playing') return prev;
        if (engine.currentPlayerIndex !== 1) return prev;

        let newEngine = engine;
        let message = '';

        let playable = getPlayableCards(newEngine, 1);

        // ROBA HASTA QUE PUEDA TIRAR o se acabe el mazo
        while (playable.length === 0 && newEngine.drawPile.length > 0) {
          newEngine = applyAction(newEngine, {
            type: ACTION_TYPES.DRAW_CARD,
            playerIndex: 1,
          });
          playable = getPlayableCards(newEngine, 1);
        }

        if (playable.length > 0) {
          const cardToPlay = playable[0];

          const wildExtra =
            cardToPlay.value === 'wild' || cardToPlay.value === '+4'
              ? { chosenColor: chooseBotColor(newEngine) }
              : {};

          newEngine = applyAction(newEngine, {
            type: ACTION_TYPES.PLAY_CARD,
            playerIndex: 1,
            cardId: cardToPlay.id,
            ...wildExtra,
          });
        } else {
          const nextIndex = getNextPlayerIndex(newEngine, 1, 1);
          newEngine = { ...newEngine, currentPlayerIndex: nextIndex };
          message = 'El bot no puede jugar. Tu turno.';
        }

        let newUiStatus = prev.uiStatus;

        if (newEngine.status === 'finished') {
          if (newEngine.winnerIndex === 0) {
            newUiStatus = 'won';
            message = '¡Te has quedado sin cartas! Has ganado 🎉';
          } else {
            newUiStatus = 'lost';
            message = 'El bot se ha quedado sin cartas. Has perdido 😭';
          }
          clearUnoTimer();
        } else if (!message) {
          if (newEngine.currentPlayerIndex === 1) {
            message = 'El bot ha jugado y repite turno.';
          } else {
            message = 'El bot ha jugado. Tu turno.';
          }
        }

        return {
          ...prev,
          engine: newEngine,
          uiStatus: newUiStatus,
          message,
        };
      });
    }, 800);

    return () => clearTimeout(timeout);
  }, [engine, isPlaying]);

  // -------------------------
  // Render
  // -------------------------

  if (!engine || !player || !bot) {
    return (
      <div className="uno-game">
        <div className="uno-status">
          <p>{game.message}</p>
        </div>
      </div>
    );
  }

  const lastActionText = renderLastAction(engine.lastAction);

  return (
    <div className="uno-game">
      <div className="uno-status">
        <p>{game.message}</p>
        <p>Mazo: {engine.drawPile.length} cartas</p>
        <p className="uno-lastaction">{lastActionText}</p>

        <div className="uno-turn">
          <span>Turno:</span>
          <span
            className={
              'uno-turn-badge ' +
              (isHumanTurn
                ? 'uno-turn-badge--you'
                : 'uno-turn-badge--bot')
            }
          >
            {engine.players?.[engine.currentPlayerIndex]?.name ?? '—'}
          </span>
        </div>
      </div>

      {/* Zona bot */}
      <div className="uno-zone uno-zone--bot">
        <h2>
          {bot.name} ({bot.hand.length} cartas)
          {bot.hand.length === 1 && <span className="uno-badge">Última Carta!</span>}
        </h2>
        <div className="uno-hand uno-hand--bot">
          {bot.hand.map((c) => (
            <div key={c.id} className="uno-card-back" />
          ))}
        </div>
      </div>

      <div className="uno-table-center">
        <div className="uno-table-main">
          {/* Montón de descarte centrado */}
          <div className="uno-discard">
            <h3>Carta en mesa</h3>
            <div className="uno-discard-stack">
              {engine.discardPile.length === 0 ? (
                <div className="uno-card-placeholder">Sin carta</div>
              ) : (
                engine.discardPile.slice(-4).map((card, idx, arr) => {
                  const isTop = idx === arr.length - 1;
                  const offset = (arr.length - 1 - idx) * 6;

                  return (
                    <div
                      key={card.id}
                      className={
                        'uno-discard-card-wrapper' +
                        (isTop ? ' uno-discard-card-wrapper--top' : '')
                      }
                      style={{
                        transform: `translateX(-${offset}px) translateY(${offset}px)`,
                        zIndex: idx,
                      }}
                    >
                      <Card
                        card={card}
                        size={isTop ? 'large' : 'normal'}
                        isLastPlayed={isTop}
                      />
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Mazo a la derecha: botón de robar */}
          <button
            className="uno-draw-button"
            onClick={handleDrawCard}
            disabled={!isPlaying || !isHumanTurn || engine.drawPile.length === 0}
          >
            <div className="uno-draw-area">
              <h3>Mazo</h3>
              <div className="uno-draw-stack">
                {engine.drawPile.length === 0 ? (
                  <div className="uno-card-placeholder uno-card-placeholder--small">
                    Vacío
                  </div>
                ) : (
                  <>
                    {Array.from({
                      length: Math.min(engine.drawPile.length, 5),
                    }).map((_, i) => (
                      <div
                        key={i}
                        className="uno-card-back uno-card-back--stack"
                        style={{
                          transform: `translateX(${i * 4}px) translateY(-${i * 3}px)`,
                          zIndex: i,
                        }}
                      />
                    ))}
                    <span className="uno-draw-label">Robar</span>
                  </>
                )}
              </div>
            </div>
          </button>
        </div>

        {/* Sólo botón de reiniciar abajo, a la izquierda */}
        <div className="uno-actions">
          <button
            className="uno-btn uno-btn--secondary"
            onClick={handleRestart}
          >
            Reiniciar partida
          </button>
        </div>
      </div>

      {/* Zona jugador */}
      <div className="uno-zone uno-zone--player">
        <h2>
          {player.name} ({player.hand.length} cartas)
          {player.hand.length === 1 && <span className="uno-badge">Última Carta!</span>}
        </h2>

        {/* Selector de color para comodín */}
        {showColorPicker && pendingWild && isPlaying && (
          <div className="uno-wild-picker">
            <p>Elige color para el comodín:</p>
            <div className="uno-wild-picker-buttons">
              <button
                className="uno-wild-color uno-wild-color--red"
                onClick={() => handleChooseWildColor('red')}
              />
              <button
                className="uno-wild-color uno-wild-color--yellow"
                onClick={() => handleChooseWildColor('yellow')}
              />
              <button
                className="uno-wild-color uno-wild-color--green"
                onClick={() => handleChooseWildColor('green')}
              />
              <button
                className="uno-wild-color uno-wild-color--blue"
                onClick={() => handleChooseWildColor('blue')}
              />
            </div>
          </div>
        )}

        {/* Botón UNO */}
        {unoPrompt && isPlaying && (
          <div className="uno-uno-wrapper">
            <button className="uno-uno-button" onClick={handleUnoClick}>
              ¡Última Carta!
            </button>

            <div className="uno-uno-timer">
              <div className="uno-uno-timer-fill" />
            </div>

            <p className="uno-uno-subtext">
              Pulsa ¡Última Carta! antes de que se vacíe la barra
            </p>
          </div>
        )}

        <div className="uno-hand uno-hand--player">
          {player.hand.map((card) => {
            const isPlayableCard =
              isPlaying &&
              isHumanTurn &&
              getPlayableCards(engine, 0).some((c) => c.id === card.id);

            return (
              <Card
                key={card.id}
                card={card}
                onClick={() => handleCardClick(card)}
                size="normal"
                disabled={!isPlayableCard}
                isPlayable={isPlayableCard}
              />
            );
          })}
        </div>
      </div>

      {uiStatus !== 'playing' && (
        <GameResultModal status={uiStatus} onRestart={handleRestart} />
      )}
    </div>
  );
}
