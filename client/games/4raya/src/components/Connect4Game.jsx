import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createConnect4Socket } from '../network/connect4Socket';
import GameResultModal from './GameResultModal.jsx';

function normalizeId(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
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
  const direct = getCookieValue(localCookie, 'nick') || getCookieValue(localCookie, 'email');
  if (direct) return direct;

  try {
    const parentCookie = window.parent?.document?.cookie || '';
    return getCookieValue(parentCookie, 'nick') || getCookieValue(parentCookie, 'email') || null;
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
  }));
  const [statusText, setStatusText] = useState('Conectando a la partida...');
  const [rematch, setRematch] = useState(null);
  const apiRef = useRef(null);

  const dropAudioRef = useRef(null);
  const lastMoveKeyRef = useRef(null);

  useEffect(() => {
    const audio = new Audio(`${import.meta.env.BASE_URL}audio/discs_drop.mp3`);
    audio.preload = 'auto';
    audio.volume = 0.7;
    dropAudioRef.current = audio;
  }, []);

  const unlockAudio = () => {
    const audio = dropAudioRef.current;
    if (!audio) return;
    try {
      const p = audio.play();
      if (p && typeof p.then === 'function') {
        p.then(() => {
          audio.pause();
          audio.currentTime = 0;
        }).catch(() => {});
      }
    } catch {
      // ignore
    }
  };

  const email = useMemo(() => resolveNickOrEmail(), []);
  const localId = useMemo(() => normalizeId(email), [email]);
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
        setEngine(nextEngine);
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

    return () => {
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

    const audio = dropAudioRef.current;
    if (!audio) return;
    try {
      audio.currentTime = 0;
      void audio.play();
    } catch {
      // ignore
    }
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

  const handleColumnClick = (column) => {
    unlockAudio();
    const api = apiRef.current;
    if (!api || typeof api.sendAction !== 'function') return;
    if (!isMyTurn) return;
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

  const modalStatus =
    engine.status !== 'finished'
      ? null
      : engine.winnerIndex == null
        ? 'tied'
        : myIndex != null && engine.winnerIndex === myIndex
          ? 'won'
          : 'lost';

  return (
    <div className="c4-game" onPointerDown={unlockAudio}>
      <div className="c4-status">
        <div className="c4-status-text">
          {statusText}
          {myIndex != null && (
            <span style={{ marginLeft: '0.5rem', opacity: 0.9 }}>
              (Tú juegas con {myIndex === 0 ? 'blancas' : 'rojas'})
            </span>
          )}
        </div>
        {codigoFromUrl && <div className="c4-status-code">Partida: {codigoFromUrl}</div>}
      </div>

      <div className="c4-board" role="grid" aria-label="Tablero 4 en raya">
        <div className="c4-columns" role="row">
          {Array.from({ length: 7 }).map((_, c) => (
            <button
              key={c}
              type="button"
              className="c4-colbtn"
              onClick={() => handleColumnClick(c)}
              disabled={!isMyTurn || engine.status !== 'playing'}
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
                return (
                  <div key={c} className="c4-cell" role="gridcell">
                    <div className={cls} />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {modalStatus && (
        <GameResultModal
          status={modalStatus}
          onRestart={handleRematch}
          isMultiplayer={true}
          rematch={rematch}
        />
      )}
    </div>
  );
}
