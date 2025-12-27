import React, { useEffect, useState, useRef, useCallback } from 'react';
import Card from './Card';
import GameResultModal from './GameResultModal';
import TableRing from './TableRing';
import ActionOverlay from './ActionOverlay';
import { createUnoSocket } from '../network/unoSocket';
import {
  initSfxFromStorage,
  unlockSfx,
  isMuted as isSfxMuted,
  setMuted as setSfxMuted,
  sfxDraw,
  sfxPlayCard,
  sfxShuffle,
  sfxWin,
  sfxLose,
} from '../../sfxSynth';
import {
  createInitialState,
  applyAction,
  ACTION_TYPES,
  getPlayableCards,
  getNextPlayerIndex,
  COLORS,
} from '../game/unoEngineMultiplayer';

const UNO_CALL_WINDOW_MS = 5000;
const ACTION_OVERLAY_MS = 1200;

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

  const [pendingWild, setPendingWild] = useState(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [isRebuildingDeck, setIsRebuildingDeck] = useState(false);
  const rebuildDeckTimerRef = useRef(null);
  const [isMuted, setIsMuted] = useState(() => {
    initSfxFromStorage();
    return isSfxMuted();
  });
  const [rematch, setRematch] = useState(() => ({
    isReady: false,
    readyCount: 0,
    totalCount: 0,
  }));
  const [tableState, setTableState] = useState(null);
  const prevUiStatusRef = useRef(null);
  const prevEngineRef = useRef(null);
  const prevEngineForRulesRef = useRef(null);
  const prevPlayersRef = useRef(null);
  const prevEngineForLeaveRef = useRef(null);

  const [lastCardRequiredForPlayerId, setLastCardRequiredForPlayerId] =
    useState(null);
  const [lastCardCalledByPlayerId, setLastCardCalledByPlayerId] = useState(null);
  const [lastCardDeadlineTs, setLastCardDeadlineTs] = useState(null);
  const [isLocallyEliminated, setIsLocallyEliminated] = useState(false);
  const [setLostPlayerIds] = useState([]);

  const [unoDeadlinesByPlayerId, setUnoDeadlinesByPlayerId] = useState({});
  const [unoWindowMs, setUnoWindowMs] = useState(UNO_CALL_WINDOW_MS);
  const [unoCallPending, setUnoCallPending] = useState(false);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [actionEffect, setActionEffect] = useState(null);
  const overlayTimerRef = useRef(null);

  const [events, setEvents] = useState([]);
  const pushEvent = useCallback((text) => {
    setEvents((prev) => {
      const next = [{ id: `${Date.now()}-${Math.random()}`, text }, ...prev];
      return next.slice(0, 12);
    });
  }, []);

  const suppressNextSfxRef = useRef(null);

  const latestEngineRef = useRef(null);
  const isLocallyEliminatedRef = useRef(false);

  const { engine, uiStatus } = game;
  const player = engine?.players?.[0] ?? null;
  const isHumanTurn = engine?.currentPlayerIndex === 0;
  const isPlaying = uiStatus === 'playing' && !isLocallyEliminated;

  useEffect(() => {
    if (!isMultiplayer) return;
    if (uiStatus === 'playing') {
      setRematch({ isReady: false, readyCount: 0, totalCount: 0 });
      setTableState(null);
    }
  }, [isMultiplayer, uiStatus]);

  const showActionEffect = useCallback((effect) => {
    if (!effect) return;
    if (overlayTimerRef.current) {
      clearTimeout(overlayTimerRef.current);
      overlayTimerRef.current = null;
    }
    setActionEffect({ ...effect, _id: `${Date.now()}-${Math.random()}` });
    overlayTimerRef.current = setTimeout(() => {
      setActionEffect(null);
      overlayTimerRef.current = null;
    }, ACTION_OVERLAY_MS);
  }, []);

  useEffect(() => {
    latestEngineRef.current = engine;
  }, [engine]);

  useEffect(() => {
    const hasServerDeadlines =
      isMultiplayer && Object.keys(unoDeadlinesByPlayerId || {}).length > 0;
    const hasLocalDeadline = !isMultiplayer && !!lastCardDeadlineTs;
    if (!hasServerDeadlines && !hasLocalDeadline) return;

    setNowTs(Date.now());
    const t = setInterval(() => setNowTs(Date.now()), 100);
    return () => clearInterval(t);
  }, [isMultiplayer, unoDeadlinesByPlayerId, lastCardDeadlineTs]);

  useEffect(() => {
    isLocallyEliminatedRef.current = isLocallyEliminated;
  }, [isLocallyEliminated]);

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
          cards: p.handCount ?? p.hand?.length ?? 0,
        })) ?? null,
      currentPlayerIndex: engine?.currentPlayerIndex ?? null,
      status: engine?.status ?? null,
      winnerIndex: engine?.winnerIndex ?? null,
      lastAction: engine?.lastAction ?? null,
    });
  }, [engine]);

  useEffect(() => {
    if (!engine) return;
    const prev = prevEngineRef.current;

    const prevDraw = prev?.drawPile?.length ?? null;
    const nextDraw = engine.drawPile?.length ?? null;
    const prevDiscard = prev?.discardPile?.length ?? null;
    const nextDiscard = engine.discardPile?.length ?? null;

    const didRebuildFromLastAction = !!engine?.lastAction?.rebuiltDeck;
    const didRebuildFromDiff =
      prev &&
      prevDraw === 0 &&
      nextDraw > 0 &&
      prevDiscard > 1 &&
      nextDiscard === 1;

    if (!didRebuildFromLastAction && !didRebuildFromDiff) return;

    requestAnimationFrame(() => {
      setIsRebuildingDeck(true);
    });
    if (rebuildDeckTimerRef.current) {
      clearTimeout(rebuildDeckTimerRef.current);
    }
    rebuildDeckTimerRef.current = setTimeout(() => {
      setIsRebuildingDeck(false);
      rebuildDeckTimerRef.current = null;
    }, 650);
  }, [engine]);

  useEffect(
    () => () => {
      if (rebuildDeckTimerRef.current) {
        clearTimeout(rebuildDeckTimerRef.current);
        rebuildDeckTimerRef.current = null;
      }
    },
    [],
  );

  useEffect(
    () => () => {
      if (overlayTimerRef.current) {
        clearTimeout(overlayTimerRef.current);
        overlayTimerRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    if (!engine) return;
    const prev = prevEngineRef.current;

    if (prev) {
      const prevTop = prev.discardPile?.[prev.discardPile.length - 1] ?? null;
      const nextTop =
        engine.discardPile?.[engine.discardPile.length - 1] ?? null;

      const prevHandCounts = new Map(
        (prev.players ?? []).map((p) => [p.id, p.hand?.length ?? 0]),
      );
      const nextHandCounts = new Map(
        (engine.players ?? []).map((p) => [p.id, p.hand?.length ?? 0]),
      );

      const totalPrevHands = [...prevHandCounts.values()].reduce(
        (a, b) => a + b,
        0,
      );
      const totalNextHands = [...nextHandCounts.values()].reduce(
        (a, b) => a + b,
        0,
      );

      const didPlayCard = prevTop?.id && nextTop?.id && prevTop.id !== nextTop.id;
      const didDrawCard = totalNextHands > totalPrevHands;

      const prevDraw = prev.drawPile?.length ?? null;
      const nextDraw = engine.drawPile?.length ?? null;
      const prevDiscard = prev.discardPile?.length ?? null;
      const nextDiscard = engine.discardPile?.length ?? null;
      const didRebuildFromLastAction = !!engine?.lastAction?.rebuiltDeck;
      const didRebuildFromDiff =
        prevDraw === 0 && nextDraw > 0 && prevDiscard > 1 && nextDiscard === 1;

      const shouldSuppress = (name) => {
        if (suppressNextSfxRef.current !== name) return false;
        suppressNextSfxRef.current = null;
        return true;
      };

      if (didRebuildFromLastAction || didRebuildFromDiff) {
        sfxShuffle();
      }
      if (didPlayCard && !shouldSuppress('play')) sfxPlayCard();
      if (didDrawCard && !shouldSuppress('draw')) sfxDraw();
    }

    prevEngineRef.current = engine;
  }, [engine]);

  useEffect(() => {
    if (isMultiplayer) return;
    if (!engine?.lastAction) return;
    if (engine.lastAction.type !== ACTION_TYPES.PLAY_CARD) return;

    const card = engine.lastAction.card;
    if (!card) return;

    const type =
      card.value === '+2'
        ? '+2'
        : card.value === '+4'
          ? '+4'
          : card.value === 'skip'
            ? 'SKIP'
            : card.value === 'reverse'
              ? 'REVERSE'
              : card.value === 'wild'
                ? 'WILD'
                : null;

    if (!type) return;
    showActionEffect({ type, color: card.color });
  }, [engine, isMultiplayer, showActionEffect]);

  useEffect(() => {
    const prevStatus = prevUiStatusRef.current;
    if (prevStatus && prevStatus !== uiStatus) {
      if (uiStatus === 'won') sfxWin();
      if (uiStatus === 'lost') sfxLose();
    }
    prevUiStatusRef.current = uiStatus;
  }, [uiStatus]);

  // ---------- helpers ----------

  const handleUserGesture = () => {
    unlockSfx();
  };

  const handleToggleMute = () => {
    unlockSfx();
    const nextMuted = !isSfxMuted();
    setSfxMuted(nextMuted);
    setIsMuted(nextMuted);
  };

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

  const sendUnoCall = () => {
    const api = unoNetRef.current;
    if (!api) return;
    if (typeof api.callUno === 'function') {
      api.callUno();
      return;
    }
    if (typeof api.sendAction === 'function') {
      api.sendAction({ type: ACTION_TYPES.CALL_UNO });
    }
  };

  const handleLastCardClick = () => {
    unlockSfx();
    if (!engine || uiStatus !== 'playing') return;
    if (isLocallyEliminated) return;
    if (!player) return;

    const myId = player.id;
    const deadlineTs = isMultiplayer
      ? unoDeadlinesByPlayerId?.[myId] ?? unoDeadlinesByPlayerId?.[String(myId)] ?? null
      : lastCardRequiredForPlayerId === myId
        ? lastCardDeadlineTs
        : null;

    const canCall =
      player.hand.length === 1 &&
      !player.hasCalledUno &&
      deadlineTs != null &&
      nowTs < deadlineTs;

    if (!canCall) return;
    if (unoCallPending) return;
    setUnoCallPending(true);

    if (isMultiplayer) {
      sendUnoCall();
      return;
    }

    setLastCardCalledByPlayerId(myId);
    setLastCardRequiredForPlayerId(null);
    setLastCardDeadlineTs(null);
    pushEvent(`${player.name} cantó última carta.`);

    setGame((prev) => {
      const { engine, uiStatus } = prev;
      if (uiStatus !== 'playing') return prev;
      if (engine.status !== 'playing') return prev;

      const newEngine = applyAction(engine, {
        type: ACTION_TYPES.CALL_UNO,
        playerIndex: 0,
      });

      return { ...prev, engine: newEngine, message: 'Última carta cantada.' };
    });

    setUnoCallPending(false);
  };

  // ---------- multiplayer (Socket.IO) ----------

  useEffect(() => {
    if (!isMultiplayer) return;

    const codigo = codigoFromUrl;
    const email = resolveNickOrEmail();
    const localPlayerKey = String(email || '').trim().toLowerCase();

    console.log('[UNO][client][DBG] multiplayer init', {
      codigo,
      email,
      cookie: typeof document !== 'undefined' ? document.cookie : null,
    });

    setUnoDeadlinesByPlayerId({});
    setLostPlayerIds([]);
    setUnoCallPending(false);
    setIsLocallyEliminated(false);

    setTimeout(() => {
      setGame((prev) => ({
        ...prev,
        engine: null,
        uiStatus: 'waiting',
        message: 'Conectando a la partida...',
      }));
    }, 0);

    if (!codigo) {
      setTimeout(() => {
        setGame((prev) => ({
          ...prev,
          engine: null,
          uiStatus: 'waiting',
          message: 'Falta el código de partida en la URL.',
        }));
      }, 0);
      return;
    }

    if (!email) {
      setTimeout(() => {
        setGame((prev) => ({
          ...prev,
          engine: null,
          uiStatus: 'waiting',
          message:
            'No se pudo leer tu nick/email (cookie). Vuelve a la app e inicia sesión.',
        }));
      }, 0);
      return;
    }

    const api = createUnoSocket({
      codigo,
      email,
      onState: (estado) => {
        const newEngine = estado && estado.engine;
        if (!newEngine) return;

        setTableState({
          players:
            estado?.players ??
            (newEngine.players ?? []).map((p) => ({
              id: p.id,
              name: p.name,
              handCount: p.handCount ?? p.hand?.length ?? 0,
            })),
          turnIndex:
            typeof estado?.turnIndex === 'number'
              ? estado.turnIndex
              : newEngine.currentPlayerIndex ?? 0,
          direction: estado?.direction === -1 ? -1 : 1,
          myPlayerId: estado?.myPlayerId ?? newEngine.players?.[0]?.id ?? null,
        });

        const localHasCalled = !!newEngine.players?.[0]?.hasCalledUno;
        if (localHasCalled) {
          setUnoCallPending(false);
        }

        setGame((prev) => {
          if (isLocallyEliminatedRef.current && newEngine.status !== 'finished') {
            return { ...prev, engine: newEngine };
          }

          let newUiStatus = prev.uiStatus;
          let message = prev.message;

          if (newEngine.status === 'finished') {
            newUiStatus = newEngine.winnerIndex === 0 ? 'won' : 'lost';
            setRematch((prevRematch) => ({
              ...prevRematch,
              totalCount:
                typeof newEngine.numHumanPlayers === 'number' && newEngine.numHumanPlayers > 0
                  ? newEngine.numHumanPlayers
                  : newEngine.players?.length ?? prevRematch.totalCount,
            }));
            const winnerName =
              newEngine.players?.[newEngine.winnerIndex]?.name ?? 'Oponente';
            message =
              newEngine.winnerIndex === 0
                ? '¡Te has quedado sin cartas! Has ganado.'
                : `${winnerName} se ha quedado sin cartas. Has perdido.`;
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
      onUnoRequired: (payload) => {
        const playerId = payload?.playerId;
        const deadlineTs = payload?.deadlineTs;
        if (playerId == null || deadlineTs == null) return;

        if (typeof payload?.windowMs === 'number' && payload.windowMs > 0) {
          setUnoWindowMs(payload.windowMs);
        }

        setUnoDeadlinesByPlayerId((prev) => ({
          ...prev,
          [playerId]: deadlineTs,
        }));

        const p = (latestEngineRef.current?.players ?? []).find((x) => x.id === playerId);
        pushEvent(`${p?.name ?? 'Un jugador'} debe cantar ÚLTIMA CARTA.`);
      },
      onUnoCleared: (payload) => {
        const playerId = payload?.playerId;
        if (playerId == null) return;
        setUnoDeadlinesByPlayerId((prev) => {
          const next = { ...(prev || {}) };
          delete next[playerId];
          delete next[String(playerId)];
          return next;
        });
      },
      onUnoCalled: (payload) => {
        const playerId = payload?.playerId;
        if (playerId == null) return;

        setUnoDeadlinesByPlayerId((prev) => {
          const next = { ...(prev || {}) };
          delete next[playerId];
          delete next[String(playerId)];
          return next;
        });

        const localId = latestEngineRef.current?.players?.[0]?.id ?? null;
        if (localId != null && localId === playerId) setUnoCallPending(false);

        const p = (latestEngineRef.current?.players ?? []).find((x) => x.id === playerId);
        pushEvent(`${p?.name ?? 'Un jugador'} cantó última carta.`);
        showActionEffect({ type: 'UNO' });
      },
      onPlayerLost: (payload) => {
        const playerId = payload?.playerId;
        if (playerId == null) return;
        setLostPlayerIds((prev) => (prev.includes(playerId) ? prev : [...prev, playerId]));

        const p = (latestEngineRef.current?.players ?? []).find((x) => x.id === playerId);
        pushEvent(`${p?.name ?? 'Un jugador'} NO cantó ÚLTIMA CARTA y perdió.`);
      },
      onGameOver: (payload) => {
        const loserPlayerId = payload?.loserPlayerId;
        const winnerPlayerId = payload?.winnerPlayerId;
        if (loserPlayerId == null) return;

        const localId = latestEngineRef.current?.players?.[0]?.id ?? null;
        if (localId != null && localId === loserPlayerId) {
          setIsLocallyEliminated(true);
          setGame((prev) => ({
            ...prev,
            uiStatus: 'lost',
            message: 'Has perdido por no cantar ÚLTIMA CARTA.',
          }));
        } else if (localId != null && winnerPlayerId != null && localId === winnerPlayerId) {
          setGame((prev) => ({
            ...prev,
            uiStatus: 'won',
            message: 'Has ganado: el rival no cantó ÚLTIMA CARTA.',
          }));
        }
      },
      onActionEffect: (payload) => {
        const effect = payload && payload.type ? payload : null;
        if (!effect) return;
        showActionEffect(effect);
      },
      onRematchStatus: (payload) => {
        const totalCount =
          typeof payload?.totalCount === 'number' ? payload.totalCount : null;
        const readyCount =
          typeof payload?.readyCount === 'number' ? payload.readyCount : null;
        const readyPlayerIds = Array.isArray(payload?.readyPlayerIds)
          ? payload.readyPlayerIds
          : [];
        setRematch((prevRematch) => ({
          ...prevRematch,
          totalCount: totalCount ?? prevRematch.totalCount,
          readyCount: readyCount ?? prevRematch.readyCount,
          isReady: readyPlayerIds.includes(localPlayerKey) || prevRematch.isReady,
        }));
      },
      onRematchStart: () => {
        setPendingWild(null);
        setShowColorPicker(false);
        setUnoDeadlinesByPlayerId({});
        setLostPlayerIds([]);
        setUnoCallPending(false);
        setIsLocallyEliminated(false);
        setEvents([]);
        setRematch({ isReady: false, readyCount: 0, totalCount: 0 });
        setGame((prev) => ({
          ...prev,
          uiStatus: 'waiting',
          message: 'Reiniciando partida...',
        }));
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
      } catch {
        /* noop */
      }
      unoNetRef.current = null;
    };
  }, []);

  // ---------- Regla: "Última carta" obligatoria ----------

  useEffect(() => {
    if (!engine) return;
    if (isMultiplayer) return;

    // Detectar "canta última carta" por transición hasCalledUno.
    const prev = prevEngineForRulesRef.current;
    if (prev) {
      const prevCalled = new Map(
        (prev.players ?? []).map((p) => [p.id, !!p.hasCalledUno]),
      );
      for (const p of engine.players ?? []) {
        const was = prevCalled.get(p.id);
        const now = !!p.hasCalledUno;
        if (was === false && now === true && p.hand?.length === 1) {
          if (lastCardCalledByPlayerId !== p.id) {
            setTimeout(() => {
              pushEvent(`${p.name} cantó última carta.`);
            }, 0);
          }
        }
      }
    }

    const prevTop = prev?.discardPile?.[prev.discardPile.length - 1] ?? null;
    const nextTop =
      engine.discardPile?.[engine.discardPile.length - 1] ?? null;
    const didPlayCardFromDiff =
      !!prevTop?.id && !!nextTop?.id && prevTop.id !== nextTop.id;

    const actorIndexFromLastAction =
      engine.lastAction?.type === ACTION_TYPES.PLAY_CARD
        ? engine.lastAction.playerIndex
        : null;
    const actorIndexFromPrevTurn = didPlayCardFromDiff
      ? prev?.currentPlayerIndex ?? null
      : null;
    const actorIndex = actorIndexFromLastAction ?? actorIndexFromPrevTurn;

    if (actorIndex !== null && actorIndex !== undefined) {
      const actor = engine.players?.[actorIndex] ?? null;
      if (
        actor &&
        actor.hand?.length === 1 &&
        !actor.hasCalledUno &&
        engine.status === 'playing'
      ) {
        if (lastCardRequiredForPlayerId !== actor.id) {
          setTimeout(() => {
            setLastCardRequiredForPlayerId(actor.id);
            setLastCardCalledByPlayerId(null);
            setLastCardDeadlineTs(Date.now() + UNO_CALL_WINDOW_MS);
            pushEvent(`${actor.name} debe pulsar ÚLTIMA CARTA.`);
          }, 0);
        }
      }
    }

    // Si el requisito está activo, resolverlo/limpiarlo según estado actual.
    if (lastCardRequiredForPlayerId) {
      const required = (engine.players ?? []).find(
        (p) => p.id === lastCardRequiredForPlayerId,
      );
      if (!required) {
        setTimeout(() => {
          setLastCardRequiredForPlayerId(null);
          setLastCardDeadlineTs(null);
        }, 0);
      } else if (required.hand?.length !== 1) {
        setTimeout(() => {
          setLastCardRequiredForPlayerId(null);
          setLastCardDeadlineTs(null);
        }, 0);
      } else if (required.hasCalledUno) {
        setTimeout(() => {
          setLastCardCalledByPlayerId(required.id);
          setLastCardRequiredForPlayerId(null);
          setLastCardDeadlineTs(null);
        }, 0);
      }
    }

    prevEngineForRulesRef.current = engine;
  }, [
    engine,
    lastCardRequiredForPlayerId,
    lastCardCalledByPlayerId,
    pushEvent,
  ]);

  useEffect(() => {
    if (isMultiplayer) return;
    if (!lastCardRequiredForPlayerId) return;
    if (!lastCardDeadlineTs) return;
    if (lastCardCalledByPlayerId === lastCardRequiredForPlayerId) return;

    const ms = lastCardDeadlineTs - Date.now();
    const timeoutMs = Math.max(0, ms);

    const t = setTimeout(() => {
      const latestEngine = latestEngineRef.current;
      if (!latestEngine) return;

      const stillRequired = (latestEngine.players ?? []).find(
        (p) => p.id === lastCardRequiredForPlayerId,
      );
      if (!stillRequired) return;
      if (stillRequired.hasCalledUno) return;
      if (stillRequired.hand?.length !== 1) return;

      pushEvent(`${stillRequired.name} NO cantó última carta y perdió.`);
      setLostPlayerIds((prev) =>
        prev.includes(stillRequired.id) ? prev : [...prev, stillRequired.id],
      );
      setLastCardRequiredForPlayerId(null);
      setLastCardDeadlineTs(null);

      const localId = latestEngine.players?.[0]?.id ?? null;

      if (!isMultiplayer) {
        const winnerIndex = stillRequired.id === localId ? 1 : 0;
        setIsLocallyEliminated(stillRequired.id === localId);
        setGame((prev) => {
          if (prev.uiStatus !== 'playing') return prev;
          const newEngine = {
            ...prev.engine,
            status: 'finished',
            winnerIndex,
          };
          return {
            ...prev,
            engine: newEngine,
            uiStatus: winnerIndex === 0 ? 'won' : 'lost',
            message:
              winnerIndex === 0
                ? 'Has ganado: el bot no cantó ÚLTIMA CARTA.'
                : 'Has perdido por no cantar ÚLTIMA CARTA.',
          };
        });
        return;
      }

      if (stillRequired.id !== localId) return;

      setIsLocallyEliminated(true);
      setGame((prev) => {
        if (prev.uiStatus !== 'playing') return prev;
        return {
          ...prev,
          uiStatus: 'lost',
          message: 'Has perdido por no cantar ÚLTIMA CARTA.',
        };
      });
    }, timeoutMs);

    return () => clearTimeout(t);
  }, [
    lastCardRequiredForPlayerId,
    lastCardDeadlineTs,
    lastCardCalledByPlayerId,
    pushEvent,
    isMultiplayer,
  ]);

  // ---------- Notificación: jugador abandona (diff players) ----------

  useEffect(() => {
    if (!engine?.players) return;

    const prevEngine = prevEngineForLeaveRef.current;
    const prevPlayers = prevEngine?.players ?? prevPlayersRef.current ?? null;

    const prevById = new Map((prevPlayers ?? []).map((p) => [p.id, p.name]));
    const nextIds = new Set(engine.players.map((p) => p.id));
    const removedIds = [];

    for (const [id, name] of prevById.entries()) {
      if (!nextIds.has(id)) {
        removedIds.push(id);
        setTimeout(() => {
          pushEvent(`${name} abandonó la partida.`);
        }, 0);
      }
    }

    // Anti-bloqueo: si el currentPlayer apunta a alguien inexistente (o quedó fuera de rango),
    // corregimos el índice localmente para no bloquear la UI.
    // Nota: esto SOLO funciona si el server/WS refleja la salida removiendo al jugador de `players`.
    const n = engine.players.length;
    if (n > 0) {
      let fixedIndex = engine.currentPlayerIndex;
      if (typeof fixedIndex !== 'number' || !Number.isFinite(fixedIndex)) {
        fixedIndex = 0;
      } else {
        fixedIndex = ((fixedIndex % n) + n) % n;
      }

      const currentMissing =
        engine.players[engine.currentPlayerIndex] == null ||
        engine.players[fixedIndex] == null;

      const prevCurrentId =
        prevEngine?.players?.[prevEngine.currentPlayerIndex]?.id ?? null;
      const currentWasRemoved =
        prevCurrentId != null && removedIds.includes(prevCurrentId);

      if ((currentMissing || currentWasRemoved) && fixedIndex !== engine.currentPlayerIndex) {
        setTimeout(() => {
          setGame((prev) => {
            if (!prev.engine) return prev;
            if (prev.engine !== engine) return prev;
            return {
              ...prev,
              engine: { ...prev.engine, currentPlayerIndex: fixedIndex },
              message: 'Turno ajustado: jugador desconectado.',
            };
          });
        }, 0);
      }
    }

    prevPlayersRef.current = engine.players.map((p) => ({
      id: p.id,
      name: p.name,
    }));
    prevEngineForLeaveRef.current = engine;
  }, [engine, pushEvent]);

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
    if (isLocallyEliminated) return;
    if (!isMultiplayer && lastCardRequiredForPlayerId === player.id) {
      setGame((prev) => ({
        ...prev,
        message: 'Debes pulsar ÚLTIMA CARTA antes de seguir jugando.',
      }));
      return;
    }

    unlockSfx();
    sfxPlayCard();
    suppressNextSfxRef.current = 'play';

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
      setPendingWild({ cardId: card.id });
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

  };

  const handleChooseWildColor = (color) => {
    if (!pendingWild) return;
    const { cardId } = pendingWild;

    setPendingWild(null);
    setShowColorPicker(false);

    if (isLocallyEliminated) return;
    if (!isMultiplayer && lastCardRequiredForPlayerId === player?.id) {
      setGame((prev) => ({
        ...prev,
        message: 'Debes pulsar ÚLTIMA CARTA antes de seguir jugando.',
      }));
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
  };

  const handleDrawCard = () => {
    if (!engine) return;
    if (!isPlaying || !isHumanTurn) return;
    if (isLocallyEliminated) return;
    if (!isMultiplayer && lastCardRequiredForPlayerId === player?.id) {
      setGame((prev) => ({
        ...prev,
        message: 'Debes pulsar ÚLTIMA CARTA antes de robar.',
      }));
      return;
    }

    unlockSfx();
    sfxDraw();
    suppressNextSfxRef.current = 'draw';

    if (isMultiplayer) {
      const canDrawNow =
        engine.drawPile.length > 0 || engine.discardPile.length > 1;
      if (!canDrawNow) {
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

      const canDrawNow =
        engine.drawPile.length > 0 || engine.discardPile.length > 1;
      if (!canDrawNow) {
        return {
          ...prev,
          message: 'No quedan cartas en el mazo.',
        };
      }

      const newEngine = applyAction(engine, {
        type: ACTION_TYPES.DRAW_CARD,
        playerIndex: 0,
      });

      if (!newEngine.lastAction?.card) {
        return {
          ...prev,
          engine: newEngine,
          message: 'No quedan cartas en el mazo.',
        };
      }

      return {
        ...prev,
        engine: newEngine,
        message: 'Has robado una carta. Si puedes, juega una.',
      };
    });
  };

  const handleRestart = () => {
    if (isMultiplayer) {
      const api = unoNetRef.current;
      if (!api || typeof api.rematchReady !== 'function') return;
      setRematch((prevRematch) =>
        prevRematch.isReady ? prevRematch : { ...prevRematch, isReady: true },
      );
      api.rematchReady();
      return;
    }

    setPendingWild(null);
    setShowColorPicker(false);

    setLastCardRequiredForPlayerId(null);
    setLastCardCalledByPlayerId(null);
    setLastCardDeadlineTs(null);
    setIsLocallyEliminated(false);
    setLostPlayerIds([]);
    setEvents([]);

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
        let botDrewCount = 0;
        let rebuiltDuringBotTurn = false;

        // ROBA HASTA QUE PUEDA TIRAR o se quede sin cartas (incluye rebuild del mazo)
        while (playable.length === 0) {
          const afterDraw = applyAction(newEngine, {
            type: ACTION_TYPES.DRAW_CARD,
            playerIndex: 1,
          });

          const drewCard =
            afterDraw.lastAction?.type === ACTION_TYPES.DRAW_CARD &&
            !!afterDraw.lastAction.card;

          newEngine = afterDraw;
          if (!drewCard) break;

          if (afterDraw.lastAction?.rebuiltDeck) {
            rebuiltDuringBotTurn = true;
          }
          botDrewCount++;

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

        if (botDrewCount > 0 || rebuiltDuringBotTurn) {
          const enrichedLastAction = newEngine.lastAction
            ? {
                ...newEngine.lastAction,
                ...(rebuiltDuringBotTurn ? { rebuiltDeck: true } : null),
                ...(botDrewCount > 0 ? { botDrewCount } : null),
              }
            : {
                type: ACTION_TYPES.DRAW_CARD,
                playerIndex: 1,
                card: null,
                ...(rebuiltDuringBotTurn ? { rebuiltDeck: true } : null),
                ...(botDrewCount > 0 ? { botDrewCount } : null),
              };
          newEngine = { ...newEngine, lastAction: enrichedLastAction };
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

  if (!engine || !player) {
    return (
      <div className="uno-game" onPointerDown={handleUserGesture}>
        <div className="uno-status">
          <p>{game.message}</p>
        </div>
      </div>
    );
  }

  const lastActionText = renderLastAction(engine.lastAction);
  const canDraw =
    engine.drawPile.length > 0 || (engine.discardPile?.length ?? 0) > 1;

  const isUnoBlockingForMe =
    !isMultiplayer &&
    !!player &&
    lastCardRequiredForPlayerId === player.id &&
    uiStatus === 'playing' &&
    !isLocallyEliminated;

  const myUnoDeadlineTs = isMultiplayer
    ? unoDeadlinesByPlayerId?.[player.id] ?? unoDeadlinesByPlayerId?.[String(player.id)] ?? null
    : lastCardRequiredForPlayerId === player.id
      ? lastCardDeadlineTs
      : null;

  const myUnoRemainingMs =
    myUnoDeadlineTs != null && nowTs != null ? myUnoDeadlineTs - nowTs : null;
  const myUnoSecondsRemaining =
    myUnoRemainingMs != null && myUnoRemainingMs > 0
      ? Math.ceil(myUnoRemainingMs / 1000)
      : null;

  const canCallUnoNow =
    isPlaying &&
    player.hand.length === 1 &&
    !player.hasCalledUno &&
    myUnoDeadlineTs != null &&
    myUnoRemainingMs != null &&
    myUnoRemainingMs > 0 &&
    !unoCallPending;

  const unoButtonTooltip =
    uiStatus !== 'playing'
      ? 'La partida ha terminado'
      : isLocallyEliminated
        ? 'Has perdido'
        : player.hand.length !== 1
          ? 'Solo cuando te quede 1 carta'
          : player.hasCalledUno
            ? 'Ya cantaste ÚLTIMA CARTA'
            : myUnoDeadlineTs == null
              ? 'Esperando confirmación del servidor...'
              : !canCallUnoNow
                ? 'Fuera de tiempo'
                : '';

  const tableUnoDeadlines = isMultiplayer
    ? unoDeadlinesByPlayerId
    : lastCardRequiredForPlayerId && lastCardDeadlineTs
      ? { [lastCardRequiredForPlayerId]: lastCardDeadlineTs }
      : {};

  return (
    <div className="uno-game" onPointerDown={handleUserGesture}>
      <div className="uno-status">
        <button
          type="button"
          className={
            'uno-mute-toggle' + (isMuted ? ' uno-mute-toggle--muted' : '')
          }
          onClick={(e) => {
            e.stopPropagation();
            handleToggleMute();
          }}
          aria-label={isMuted ? 'Activar sonido' : 'Silenciar'}
          title={isMuted ? 'Activar sonido' : 'Silenciar'}
        >
          {isMuted ? 'Unmute' : 'Mute'}
        </button>
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

        {events.length > 0 && (
          <div className="uno-events">
            <div className="uno-events-title">Eventos</div>
            <ul className="uno-events-list">
              {events.map((e) => (
                <li key={e.id} className="uno-events-item">
                  {e.text}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <TableRing
        gameState={
          tableState ?? {
            players: (engine.players ?? []).map((p) => ({
              id: p.id,
              name: p.name,
              handCount: p.handCount ?? p.hand?.length ?? 0,
            })),
            turnIndex: engine.currentPlayerIndex ?? 0,
            direction: engine.direction === -1 ? -1 : 1,
            myPlayerId: player.id,
          }
        }
      >
        <ActionOverlay effect={actionEffect} key={actionEffect?._id ?? 'x'} />

        <div className="uno-table-hud" aria-hidden="true">
          <div className="uno-direction">
            {engine.direction === 1 ? '↻' : '↺'}
          </div>
        </div>

        <div className="uno-table-main">
          <div className="centerPiles">
            <div className="uno-discard">
              <h3>Carta en mesa</h3>
              <div
                className={
                  'uno-discard-stack' +
                  (isRebuildingDeck ? ' uno-discard-stack--rebuilding' : '')
                }
              >
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

            <button
              className="uno-draw-button"
              onClick={handleDrawCard}
              disabled={!isPlaying || !isHumanTurn || !canDraw || isUnoBlockingForMe}
            >
              <div className="uno-draw-area">
                <h3>Mazo</h3>
                <div
                  className={
                    'uno-draw-stack' +
                    (isRebuildingDeck ? ' uno-draw-stack--rebuilding' : '')
                  }
                >
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
        </div>
      </TableRing>

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

        <div className="uno-uno-wrapper">
          <span className="uno-uno-tooltip" title={unoButtonTooltip}>
            <button
              type="button"
              className="uno-uno-button"
              onClick={handleLastCardClick}
              disabled={!canCallUnoNow}
            >
              ÚLTIMA CARTA
            </button>
          </span>

          {myUnoDeadlineTs != null &&
            player.hand.length === 1 &&
            !player.hasCalledUno &&
            myUnoRemainingMs != null &&
            myUnoRemainingMs > 0 && (
              <>
                <div className="uno-lastcard-timer">
                  <div
                    className="uno-lastcard-timer-fill"
                    style={{
                      transform: `scaleX(${Math.max(
                        0,
                        Math.min(
                          1,
                          myUnoRemainingMs / (isMultiplayer ? unoWindowMs : UNO_CALL_WINDOW_MS),
                        ),
                      )})`,
                    }}
                  />
                </div>
                <p className="uno-uno-subtext">
                  Te quedan {myUnoSecondsRemaining}s para cantar.
                </p>
              </>
            )}
        </div>

        <div className="uno-hand uno-hand--player">
          {player.hand.map((card) => {
            const isPlayableCard =
              isPlaying &&
              isHumanTurn &&
              !isUnoBlockingForMe &&
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

      {(uiStatus === 'won' || uiStatus === 'lost') && (
        <GameResultModal
          status={uiStatus}
          onRestart={handleRestart}
          isMultiplayer={isMultiplayer}
          rematch={isMultiplayer ? rematch : null}
        />
      )}
    </div>
  );
}
