import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createConnect4Socket } from '../network/connect4Socket';
import GameResultModal from './GameResultModal.jsx';
import {
  initSfxFromStorage,
  unlockSfx,
  isMuted as isSfxMuted,
  setMuted as setSfxMuted,
  sfxDrop,
  sfxWin,
  sfxLose,
} from '../sfx';

function normalizeId(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function publicUserIdFromEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return '';
  let hash = 5381;
  for (let i = 0; i < e.length; i += 1) {
    hash = ((hash << 5) + hash + e.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

function getCookieValue(cookieStr, name) {
  const parts = String(cookieStr || '')
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
}

function resolveNickOrEmail() {
  const localCookie = typeof document !== 'undefined' ? document.cookie : '';
  const email = getCookieValue(localCookie, 'email');
  if (email) return email;

  // Back-compat: antes la cookie `nick` podía guardar el email.
  const legacyNick = getCookieValue(localCookie, 'nick');
  if (legacyNick && legacyNick.includes('@')) return legacyNick;

  try {
    const parentCookie = window.parent?.document?.cookie || '';
    const parentEmail = getCookieValue(parentCookie, 'email');
    if (parentEmail) return parentEmail;
    const parentNick = getCookieValue(parentCookie, 'nick');
    if (parentNick && parentNick.includes('@')) return parentNick;
    return null;
  } catch {
    return null;
  }
}

function buildEmptyBoard() {
  return Array.from({ length: 6 }, () => Array(7).fill(null));
}

export default function Connect4Game() {
  const codigoFromUrl = new URLSearchParams(window.location.search).get('codigo');
  const [engine, setEngine] = useState(() => ({
    players: [],
    board: buildEmptyBoard(),
    currentPlayerIndex: 0,
    status: 'playing',
    winnerIndex: null,
    lastMove: null,
    winningCells: null,
  }));
  const [statusText, setStatusText] = useState('Conectando a la partida...');
  const [rematch, setRematch] = useState(null);
  const [isReviewingEnd, setIsReviewingEnd] = useState(false);
  const [stateError, setStateError] = useState('');
  const apiRef = useRef(null);

  const lastMoveKeyRef = useRef(null);
  const dropTimerRef = useRef(null);
  const endSoundKeyRef = useRef(null);
  const hasStateRef = useRef(false);
  const [isMuted, setIsMuted] = useState(() => {
    initSfxFromStorage();
    return isSfxMuted();
  });
  const [droppingMove, setDroppingMove] = useState(null);
  const [isDropping, setIsDropping] = useState(false);

  const handleUserGesture = () => {
    void unlockSfx();
  };

  const handleToggleMute = (e) => {
    e?.stopPropagation?.();
    handleUserGesture();
    const next = !isSfxMuted();
    setSfxMuted(next);
    setIsMuted(next);
  };

  const email = useMemo(() => resolveNickOrEmail(), []);
  const localId = useMemo(() => publicUserIdFromEmail(email) || normalizeId(email), [email]);
  const myIndex = useMemo(() => {
    const idx = (engine.players || []).findIndex((p) => normalizeId(p?.id) === localId);
    return idx >= 0 ? idx : null;
  }, [engine.players, localId]);

  const isMyTurn = engine.status === 'playing' && myIndex != null && engine.currentPlayerIndex === myIndex;

  useEffect(() => {
    if (!codigoFromUrl) {
      setStatusText('Falta el código de partida en la URL.');
      return;
    }
    if (!email) {
      setStatusText('No se pudo leer tu nick/email (cookie). Vuelve a la app e inicia sesión.');
      return;
    }

    const api = createConnect4Socket({
      codigo: codigoFromUrl,
      email,
      onState: (nextEngine) => {
        if (!nextEngine) return;
        hasStateRef.current = true;
        setEngine(nextEngine);
        setStateError('');
      },
      onRematchReady: (newCodigo, error) => {
        if (error) {
          setRematch(null);
          setStatusText(error);
          return;
        }
        if (!newCodigo) return;
        const nextUrl = `${window.location.origin}/4raya?codigo=${encodeURIComponent(newCodigo)}`;
        window.location.assign(nextUrl);
      },
      onError: () => {
        setStatusText('Error de conexión con el servidor.');
      },
    });
    apiRef.current = api;
    setStatusText('Conectado. Esperando estado...');
    hasStateRef.current = false;
    setStateError('');

    const t = setTimeout(() => {
      if (hasStateRef.current) return;
      setStateError('No llega el estado. Puedes reintentar.');
      try {
        api.requestState?.((res) => {
          const reason = res && res.reason ? String(res.reason) : 'NO_RESPONSE';
          if (reason === 'WAITING_FOR_PLAYERS') {
            setStateError('Esperando al segundo jugador...');
          } else {
            setStateError('No llega el estado. Puedes reintentar.');
          }
        });
      } catch {
        // ignore
      }
    }, 2600);

    return () => {
      clearTimeout(t);
      try {
        api.disconnect();
      } catch {
        // ignore
      }
      apiRef.current = null;
    };
  }, [codigoFromUrl, email]);

  useEffect(() => {
    const move = engine.lastMove;
    const key = move ? `${move.playerIndex}-${move.row}-${move.col}` : null;
    if (!key || key === lastMoveKeyRef.current) return;
    lastMoveKeyRef.current = key;

    setDroppingMove(move);
    setIsDropping(true);
    if (dropTimerRef.current) clearTimeout(dropTimerRef.current);
    dropTimerRef.current = setTimeout(() => {
      setIsDropping(false);
      setDroppingMove(null);
      dropTimerRef.current = null;
    }, 420);

    sfxDrop();
  }, [engine.lastMove]);

  useEffect(() => {
    if (engine.status === 'finished') {
      if (engine.winnerIndex == null) setStatusText('Empate.');
      else if (myIndex != null && engine.winnerIndex === myIndex) setStatusText('¡Has ganado!');
      else setStatusText('Has perdido.');
      return;
    }

    const players = engine.players || [];
    const turnName = players[engine.currentPlayerIndex]?.name ?? '—';
    if (myIndex == null) {
      setStatusText(players.length < 2 ? 'Esperando al segundo jugador...' : `Turno de ${turnName}`);
      return;
    }
    setStatusText(isMyTurn ? 'Tu turno' : `Turno de ${turnName}`);
  }, [engine.status, engine.winnerIndex, engine.currentPlayerIndex, engine.players, myIndex, isMyTurn]);

  useEffect(() => {
    if (engine.status !== 'finished') {
      endSoundKeyRef.current = null;
      return;
    }

    const key = `${engine.status}-${engine.winnerIndex ?? 'tie'}-${myIndex ?? 'na'}`;
    if (endSoundKeyRef.current === key) return;
    endSoundKeyRef.current = key;

    const didWin = myIndex != null && engine.winnerIndex != null && engine.winnerIndex === myIndex;
    if (didWin) sfxWin();
    else sfxLose(); // incluye empate
  }, [engine.status, engine.winnerIndex, myIndex]);

  useEffect(() => {
    if (engine.status !== 'finished') setIsReviewingEnd(false);
  }, [engine.status]);

  const handleColumnClick = (column) => {
    handleUserGesture();
    const api = apiRef.current;
    if (!api || typeof api.sendAction !== 'function') return;
    if (!isMyTurn) return;
    if (isDropping) return;
    api.sendAction({ type: 'PLACE_TOKEN', column });
  };

  const handleRematch = () => {
    const api = apiRef.current;
    if (!api || typeof api.requestRematch !== 'function') return;
    if (!codigoFromUrl || !email) return;
    if (engine.status !== 'finished') return;

    setRematch({ isReady: true, readyCount: 1, totalCount: 2 });
    api.requestRematch();
  };

  const handleRetryState = () => {
    const api = apiRef.current;
    if (!api || typeof api.requestState !== 'function') return;
    setStateError('Reintentando...');
    api.requestState((res) => {
      if (res && res.ok) setStateError('');
      else {
        const reason = res && res.reason ? String(res.reason) : 'NO_RESPONSE';
        setStateError(reason === 'WAITING_FOR_PLAYERS' ? 'Esperando al segundo jugador...' : 'No se pudo obtener el estado.');
      }
    });
  };

  const modalStatus =
    engine.status !== 'finished'
      ? null
      : engine.winnerIndex == null
        ? 'tied'
        : myIndex != null && engine.winnerIndex === myIndex
          ? 'won'
          : 'lost';

  const winningSet = useMemo(() => {
    const arr = Array.isArray(engine.winningCells) ? engine.winningCells : null;
    if (!arr || arr.length === 0) return null;
    return new Set(arr.map((p) => `${p.r},${p.c}`));
  }, [engine.winningCells]);

  return (
    <div className="c4-game" onPointerDown={handleUserGesture}>
      <div className="c4-status">
        <div className="c4-status-text">
          {statusText}
          {myIndex != null && (
            <span style={{ marginLeft: '0.5rem', opacity: 0.9 }}>
              (Tú juegas con {myIndex === 0 ? 'blancas' : 'rojas'})
            </span>
          )}
        </div>
        <div className="c4-status-right">
          <button
            type="button"
            className={'c4-mute-toggle' + (isMuted ? ' c4-mute-toggle--muted' : '')}
            onClick={handleToggleMute}
            aria-label={isMuted ? 'Activar sonido' : 'Silenciar'}
            title={isMuted ? 'Activar sonido' : 'Silenciar'}
          >
            {isMuted ? '🔇' : '🔊'}
          </button>
          {codigoFromUrl && <div className="c4-status-code">Partida: {codigoFromUrl}</div>}
        </div>
      </div>

      {stateError && (
        <div className="c4-state-error" role="status" aria-live="polite">
          <span className="c4-state-error__text">{stateError}</span>
          <button type="button" className="c4-state-error__btn" onClick={handleRetryState}>
            Reintentar
          </button>
        </div>
      )}

      <div className="c4-board" role="grid" aria-label="Tablero 4 en raya">
        <div className="c4-columns" role="row">
          {Array.from({ length: 7 }).map((_, c) => (
            <button
              key={c}
              type="button"
              className="c4-colbtn"
              onClick={() => handleColumnClick(c)}
              disabled={!isMyTurn || engine.status !== 'playing' || isDropping}
              aria-label={`Soltar ficha en columna ${c + 1}`}
            >
              ▼
            </button>
          ))}
        </div>

        <div className="c4-grid">
          {(engine.board || buildEmptyBoard()).map((row, r) => (
            <div key={r} className="c4-row" role="row">
              {row.map((cell, c) => {
                const cls =
                  cell === 0 ? 'c4-disc c4-disc--white' : cell === 1 ? 'c4-disc c4-disc--red' : 'c4-disc';
                const isThisDropping =
                  !!droppingMove &&
                  droppingMove.row === r &&
                  droppingMove.col === c &&
                  droppingMove.playerIndex === cell;
                const isWinningCell = !!isReviewingEnd && !!winningSet && winningSet.has(`${r},${c}`);
                return (
                  <div key={c} className={'c4-cell' + (isWinningCell ? ' c4-cell--win' : '')} role="gridcell">
                    <div
                      className={cls + (isThisDropping ? ' c4-disc--dropping' : '')}
                      style={isThisDropping ? { '--drop-rows': r + 1 } : undefined}
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {modalStatus && !isReviewingEnd && (
        <GameResultModal
          status={modalStatus}
          onRestart={handleRematch}
          onViewBoard={() => setIsReviewingEnd(true)}
          isMultiplayer={true}
          rematch={rematch}
        />
      )}

      {engine.status === 'finished' && isReviewingEnd && (
        <div className="c4-reviewbar">
          <button type="button" className="c4-review-close" onClick={() => setIsReviewingEnd(false)}>
            Cerrar revisión
          </button>
        </div>
      )}
    </div>
  );
}
