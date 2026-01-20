import {
  BLANCAS,
  CODIGO_PARTIDA,
  CONECTANDO,
  CONECTADO_ESPERANDO,
  DAMAS,
  DEBES_SEGUIR_CAPTURANDO,
  EMAIL_FALTANTE,
  ERROR_CONEXION,
  FALTA_CODIGO,
  INICIAR_SESION,
  NEGRAS,
  PARTIDA_FINALIZADA,
  PERDISTE,
  SALIR,
  TURNO,
  TU_COLOR,
  TU_TURNO,
  TURNO_RIVAL,
  GANASTE,
  JUGAR_OTRA,
  REINICIANDO,
} from "./utils/strings.js";
import { parseCodigoFromUrl, resolveNickOrEmail } from "./utils/session.js";
import { createSfx } from "./utils/sfx.js";
import { PanelInfo } from "./components/PanelInfo.js";
import { TableroDamas } from "./components/TableroDamas.js";
import { ModalFinal } from "./components/ModalFinal.js";
import { createDamasEngine } from "./src/engine/damasEngine.js";
import { createDamasSocket } from "./src/net/damasSocket.js";

function normalizeId(value) {
  return String(value || "").trim().toLowerCase();
}

function publicUserIdFromEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return "";
  let hash = 5381;
  for (let i = 0; i < e.length; i += 1) {
    hash = ((hash << 5) + hash + e.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

function isDarkSquare(r, c) {
  return ((r + c) & 1) === 1;
}

function pieceOwner(piece) {
  if (piece > 0) return "white";
  if (piece < 0) return "black";
  return null;
}

function isKing(piece) {
  return Math.abs(piece) === 2;
}

function posEq(a, b) {
  return !!a && !!b && a.r === b.r && a.c === b.c;
}

export class DamasGame {
  constructor() {
    this.socket = null;
    this.net = null;
    this.codigo = null;
    this.email = null;
    this.myId = null;
    this.engine = null;

    this.isMuted = false;
    this._stateWaitTimer = null;
    this._stateErrorTimer = null;

    this.sfx = createSfx();

    this.panel = new PanelInfo({
      title: DAMAS,
      onFullscreen: () => this.toggleFullscreen(),
      onExit: () => this.exitToLobby(),
      onToggleMute: () => this.toggleMute(),
    });

    this.board = new TableroDamas({
      onCellClick: (r, c) => this.onCellClick(r, c),
      onUserGesture: () => this.sfx.unlock(),
    });

    this.modal = new ModalFinal({
      onRestart: () => this.requestRestart(),
      onExit: () => this.exitToLobby(),
      onViewBoard: () => this.enterEndReview(),
    });
  }

  get state() {
    return this.engine?.state ?? null;
  }

  get myColor() {
    return this.engine?.myColor ?? null;
  }

  get selectedFrom() {
    return this.engine?.selectedFrom ?? null;
  }

  set selectedFrom(value) {
    if (!this.engine) return;
    this.engine.selectedFrom = value;
  }

  get rematch() {
    return this.engine?.rematch ?? null;
  }

  set rematch(value) {
    if (!this.engine) return;
    this.engine.rematch = value;
  }

  get rematchCancelledReason() {
    return this.engine?.rematchCancelledReason ?? null;
  }

  set rematchCancelledReason(value) {
    if (!this.engine) return;
    this.engine.rematchCancelledReason = value;
  }

  get restartPending() {
    return this.engine?.restartPending ?? false;
  }

  set restartPending(value) {
    if (!this.engine) return;
    this.engine.restartPending = !!value;
  }

  get endSoundKey() {
    return this.engine?.endSoundKey ?? null;
  }

  set endSoundKey(value) {
    if (!this.engine) return;
    this.engine.endSoundKey = value;
  }

  get isReviewingEnd() {
    return this.engine?.isReviewingEnd ?? false;
  }

  set isReviewingEnd(value) {
    if (!this.engine) return;
    this.engine.isReviewingEnd = !!value;
  }

  mount(root) {
    if (!root) return;
    this.root = root;
    this.root.innerHTML = "";

    const page = document.createElement("div");
    page.className = "damasPage";

    const header = document.createElement("div");
    header.className = "damasHeader";
    header.appendChild(this.panel.el);

    const main = document.createElement("div");
    main.className = "damasMain";
    main.appendChild(this.board.el);

    const footer = document.createElement("div");
    footer.className = "damasFooter";
    footer.innerHTML = `
      <div class="damasFooterInner text-muted">
        ${TURNO}: <span data-role="turnFooter">—</span>
      </div>
    `;
    this.turnFooterEl = footer.querySelector('[data-role="turnFooter"]');

    const reviewBar = document.createElement("div");
    reviewBar.className = "damasReviewBar";
    reviewBar.style.display = "none";
    reviewBar.innerHTML = `
      <button type="button" class="damasReviewClose" data-role="closeReview">Cerrar revisión</button>
    `;
    reviewBar.querySelector('[data-role="closeReview"]').addEventListener("click", (e) => {
      e?.preventDefault?.();
      this.exitEndReview();
    });
    this.reviewBarEl = reviewBar;

    page.appendChild(header);
    page.appendChild(main);
    page.appendChild(footer);
    page.appendChild(reviewBar);
    page.appendChild(this.modal.el);

    this.root.appendChild(page);

    this.init();
  }

  init() {
    this.codigo = parseCodigoFromUrl();
    this.email = resolveNickOrEmail();
    this.myId = publicUserIdFromEmail(this.email) || normalizeId(this.email);

    this.panel.setSubtitle(CONECTANDO);
    this.panel.setMetaLeft(this.codigo ? `${CODIGO_PARTIDA}: ${this.codigo}` : "");
    this.panel.setMetaRight("");
    this.panel.setError("");
    this.panel.setNotice("");

    if (!this.codigo) {
      this.panel.setError(FALTA_CODIGO);
      this.panel.setSubtitle(FALTA_CODIGO);
      this.panel.setNotice(INICIAR_SESION);
      return;
    }
    if (!this.email) {
      this.panel.setError(EMAIL_FALTANTE);
      this.panel.setSubtitle(EMAIL_FALTANTE);
      return;
    }
    if (typeof window.io !== "function") {
      this.panel.setError("Socket.IO no está disponible.");
      return;
    }

    this.sfx.init().catch(() => {});
    this.sfx.initSfxFromStorage?.();
    this.isMuted = this.sfx.isMuted?.() ?? false;
    this.panel.setMuted?.(this.isMuted);

    this.engine = createDamasEngine({
      codigo: this.codigo,
      myPlayerId: this.myId,
    });

    this.socket = window.io(window.location.origin, {
      path: "/socket.io",
      withCredentials: true,
    });

    this.net = createDamasSocket(this.socket, {
      codigo: this.codigo,
      email: this.email,
      handlers: {
        onConnect: () => this.handleSocketConnect(),
        onState: (payload) => this.handleSocketState(payload),
        onGameState: (payload) => this.handleSocketGameState(payload),
        onRematchState: (payload) => this.handleSocketRematchState(payload),
        onRematchCancelled: (payload) => this.handleSocketRematchCancelled(payload),
        onRematchStart: (payload) => this.handleSocketRematchStart(payload),
        onRestart: (payload) => this.handleSocketRestart(payload),
        onError: (payload) => this.handleSocketError(payload),
        onConnectError: () => this.handleSocketConnectError(),
      },
    });

    this.net.subscribe();
  }

  handleSocketConnect() {
    this.panel.setError("");
    this.panel.setSubtitle(CONECTADO_ESPERANDO);
    this._clearStateTimers();
    this._stateWaitTimer = setTimeout(() => {
      if (this.engine?.state) return;
      this.requestState({ silent: true });
    }, 1400);
    this._stateErrorTimer = setTimeout(() => {
      if (this.engine?.state) return;
      this.requestState({
        silent: true,
        onResult: (res) => {
          if (this.engine?.state) return;
          const reason = res && res.reason ? String(res.reason) : "NO_RESPONSE";
          this.panel.setNotice({
            text:
              reason === "WAITING_FOR_PLAYERS"
                ? "Esperando al otro jugador..."
                : "No llega el estado. Puedes reintentar.",
            actionLabel: "Reintentar",
            onAction: () => this.requestState({ silent: false }),
          });
        },
      });
    }, 2600);
  }

  handleSocketState(payload) {
    if (!this.engine) return;
    const updated = this.engine.applyServerState(payload);
    if (!updated) return;
    this._clearStateTimers();
    this.render();
  }

  handleSocketGameState(payload) {
    if (!this.engine) return;
    const updated = this.engine.applyGameState(payload);
    if (!updated) return;
    this._clearStateTimers();
    this.render();
  }

  handleSocketRematchState(payload) {
    if (!this.engine) return;
    if (!this.engine.handleRematchState(payload)) return;
    this.render();
  }

  handleSocketRematchCancelled(payload) {
    if (!this.engine) return;
    if (!this.engine.handleRematchCancelled(payload)) return;
    this.render();
  }

  handleSocketRematchStart(payload) {
    if (!this.engine) return;
    const result = this.engine.handleRematchStart(payload);
    if (!result.handled) return;
    if (result.updated) this._clearStateTimers();
    this.modal.hide();
    this.render();
  }

  handleSocketRestart(payload) {
    if (!payload || String(payload.codigo || "").trim() !== String(this.codigo)) return;
    if (payload.newCodigo) {
      const nextUrl = `${window.location.origin}/damas?codigo=${encodeURIComponent(payload.newCodigo)}`;
      window.location.assign(nextUrl);
      return;
    }
    if (this.engine) {
      this.engine.resetAfterRestart();
    }
    this.modal.hide();
    this.render();
  }

  handleSocketError(payload) {
    if (!payload || String(payload.codigo || "").trim() !== String(this.codigo)) return;
    if (this.engine) {
      this.engine.resetAfterError();
    }
    const msg = payload.message || "Movimiento inválido.";
    this.panel.setError(msg);
    this.render();
  }

  handleSocketConnectError() {
    this.panel.setError(ERROR_CONEXION);
    this.panel.setSubtitle(ERROR_CONEXION);
  }

  toggleMute() {
    try {
      this.sfx.unlock?.();
    } catch {}
    const next = !(this.sfx.isMuted?.() ?? false);
    this.sfx.setMuted?.(next);
    this.isMuted = next;
    this.panel.setMuted?.(next);
  }

  _clearStateTimers() {
    if (this._stateWaitTimer) {
      clearTimeout(this._stateWaitTimer);
      this._stateWaitTimer = null;
    }
    if (this._stateErrorTimer) {
      clearTimeout(this._stateErrorTimer);
      this._stateErrorTimer = null;
    }
  }

  requestState({ silent = false, onResult } = {}) {
    if (!this.net || !this.codigo || !this.email) return;
    if (!silent) {
      this.panel.setNotice({
        text: "Reintentando estado...",
        actionLabel: "Reintentar",
        onAction: () => this.requestState({ silent: false }),
      });
    }
    this.net.requestState((res) => {
      if (typeof onResult === "function") onResult(res);
      if (res && res.ok) return;
      if (!silent) {
        const reason = res && res.reason ? String(res.reason) : "NO_RESPONSE";
        this.panel.setNotice({
          text: reason === "WAITING_FOR_PLAYERS" ? "Esperando al otro jugador..." : "No se pudo obtener el estado.",
          actionLabel: "Reintentar",
          onAction: () => this.requestState({ silent: false }),
        });
      }
    });
  }

  isMyTurn() {
    return (
      this.state &&
      this.state.status === "playing" &&
      this.myColor &&
      this.state.currentPlayer === this.myColor
    );
  }

  legalMovePool() {
    const legal = this.state?.legalMoves;
    if (!legal) return [];
    const captures = Array.isArray(legal.captures) ? legal.captures : [];
    const normals = Array.isArray(legal.normals) ? legal.normals : [];
    return captures.length > 0 ? captures : normals;
  }

  isBotMatch() {
    const players = Array.isArray(this.state?.players) ? this.state.players : [];
    return players.some((p) => String(p?.id || "").startsWith("bot:"));
  }

  movesForFrom(from) {
    const pool = this.legalMovePool();
    return pool.filter((m) => m?.from?.r === from.r && m?.from?.c === from.c);
  }

  render() {
    if (!this.state) return;

    const turnText = this.state.currentPlayer === "white" ? BLANCAS : NEGRAS;
    this.panel.setTurnLabel(`${TURNO}: ${turnText}`);
    if (this.turnFooterEl) this.turnFooterEl.textContent = turnText;

    const myColorText = this.myColor
      ? `${TU_COLOR}: ${this.myColor === "white" ? BLANCAS : NEGRAS}`
      : `${TU_COLOR}: —`;
    this.panel.setMetaRight(myColorText);

    if (this.state.status === "finished") {
      this.panel.setSubtitle(PARTIDA_FINALIZADA);
    } else if (!this.myColor) {
      this.panel.setSubtitle(CONECTADO_ESPERANDO);
    } else if (this.isMyTurn()) {
      this.panel.setSubtitle(TU_TURNO);
    } else {
      this.panel.setSubtitle(TURNO_RIVAL);
    }

    if (this.isMyTurn() && this.state.forcedFrom) {
      this.panel.setNotice(DEBES_SEGUIR_CAPTURANDO);
    } else {
      this.panel.setNotice("");
    }

    if (this.isMyTurn() && this.state.forcedFrom) {
      if (!this.selectedFrom || !posEq(this.selectedFrom, this.state.forcedFrom)) {
        this.selectedFrom = { ...this.state.forcedFrom };
      }
    }

    if (this.selectedFrom) {
      const allowed = this.movesForFrom(this.selectedFrom);
      if (allowed.length === 0) this.selectedFrom = null;
    }

    const dests = new Set();
    if (this.selectedFrom) {
      for (const m of this.movesForFrom(this.selectedFrom)) {
        dests.add(`${m.to.r},${m.to.c}`);
      }
    }

    const highlights = new Set();
    if (this.state.status === "finished" && this.isReviewingEnd) {
      const mv = this.state.lastMove;
      if (mv?.from) highlights.add(`${mv.from.r},${mv.from.c}`);
      if (mv?.to) highlights.add(`${mv.to.r},${mv.to.c}`);
      if (mv?.captured) highlights.add(`${mv.captured.r},${mv.captured.c}`);
    }

    this.board.render({
      board: this.state.board,
      selectedFrom: this.selectedFrom,
      destinations: dests,
      forcedFrom: this.state.forcedFrom,
      highlights,
      disabled: !this.isMyTurn(),
      flip: this.myColor === "black",
      pieceRenderer: (piece) => {
        if (piece === 0) return null;
        const owner = pieceOwner(piece);
        if (!owner) return null;
        return { owner, crowned: isKing(piece) };
      },
    });

    this.panel.setCounts({
      white: this.state.pieceCounts?.white ?? 0,
      black: this.state.pieceCounts?.black ?? 0,
    });

    if (this.state.status === "finished") {
      this.maybePlayEndSound();
      if (this.isReviewingEnd) {
        this.modal.hide();
        if (this.reviewBarEl) this.reviewBarEl.style.display = "";
        return;
      }
      if (this.reviewBarEl) this.reviewBarEl.style.display = "none";
      const isBot = this.isBotMatch();
      const voters = Array.isArray(this.rematch?.voters) ? this.rematch.voters : [];
      const humanPlayers = (Array.isArray(this.state?.players) ? this.state.players : []).filter(
        (p) => p && !String(p.id || "").startsWith("bot:"),
      );
      const otherId = String(humanPlayers.find((p) => normalizeId(p?.id) !== this.myId)?.id || "").trim();
      const myAccepted = !!this.myId && voters.includes(String(this.myId));
      const otherAccepted = !!otherId && voters.includes(otherId);

      let restartLabel = this.restartPending ? REINICIANDO : JUGAR_OTRA;
      let canRestart = !this.restartPending;
      let hintText = "";

      if (!isBot) {
        if (this.rematchCancelledReason) {
          const reason = String(this.rematchCancelledReason || "").trim().toLowerCase();
          hintText =
            reason === "timeout"
              ? "Sin respuesta del rival. No se pudo iniciar otra ronda."
              : reason === "player_disconnected"
                ? "El otro jugador se ha desconectado. No se puede iniciar otra ronda."
                : "El otro jugador ha salido. No se puede iniciar otra ronda.";
          restartLabel = "";
          canRestart = false;
        } else if (this.rematch?.active === true) {
          if (myAccepted) {
            restartLabel = "Esperando a que el otro acepte…";
            canRestart = false;
            hintText = "Esperando a que el otro jugador acepte…";
          } else {
            restartLabel = JUGAR_OTRA;
            canRestart = true;
            hintText = otherAccepted ? "El otro jugador quiere otra ronda." : "¿Quieres jugar otra ronda?";
          }
        } else {
          restartLabel = JUGAR_OTRA;
          canRestart = true;
          hintText = "¿Quieres jugar otra ronda?";
        }
      }
      this.modal.show({
        title: DAMAS,
        result: this.myColor && this.state.winner === this.myColor ? GANASTE : PERDISTE,
        winnerName: this.state.winnerName || "—",
        loserName: this.state.loserName || "—",
        restartText: restartLabel,
        canRestart,
        hintText,
        exitText: SALIR,
        viewText: "Ver tablero",
        canView: true,
      });
    } else {
      this.modal.hide();
      if (this.reviewBarEl) this.reviewBarEl.style.display = "none";
      this.isReviewingEnd = false;
      this.endSoundKey = null;
    }
  }

  enterEndReview() {
    if (!this.state || this.state.status !== "finished") return;
    this.isReviewingEnd = true;
    this.render();
  }

  exitEndReview() {
    if (!this.state || this.state.status !== "finished") return;
    this.isReviewingEnd = false;
    this.render();
  }

  onCellClick(r, c) {
    this.panel.setError("");
    if (!this.state || this.state.status !== "playing") return;
    if (!isDarkSquare(r, c)) return;
    if (!this.isMyTurn()) return;

    const forced = this.state.forcedFrom;
    if (forced && (!this.selectedFrom || !posEq(this.selectedFrom, forced))) {
      this.selectedFrom = { ...forced };
    }

    const piece = this.state.board?.[r]?.[c] ?? 0;
    const owner = pieceOwner(piece);

    if (this.selectedFrom) {
      const destinations = this.movesForFrom(this.selectedFrom);
      const chosen = destinations.find((m) => m.to.r === r && m.to.c === c);
      if (chosen) {
        this.net?.sendAction({
          from: { ...this.selectedFrom },
          to: { r, c },
        });
        return;
      }
    }

    if (!owner || owner !== this.myColor) {
      this.selectedFrom = null;
      this.render();
      return;
    }

    const nextFrom = { r, c };
    if (forced && !posEq(forced, nextFrom)) {
      this.selectedFrom = { ...forced };
      this.render();
      return;
    }

    const possible = this.movesForFrom(nextFrom);
    this.selectedFrom = possible.length > 0 ? nextFrom : null;
    this.render();
  }

  maybePlayEndSound() {
    if (!this.state || this.state.status !== "finished") return;
    if (!this.myColor) return;
    const key = `${this.codigo}|${this.state.winner || "none"}|${this.myColor}|${this.state.winnerPlayerId || ""}`;
    if (this.endSoundKey === key) return;
    this.endSoundKey = key;
    const didWin = this.state.winner === this.myColor;
    if (didWin) this.sfx.playWin();
    else this.sfx.playLose();
  }

  requestRestart() {
    if (!this.net || !this.codigo || !this.email) return;
    if (!this.state || this.state.status !== "finished") return;
    this.endSoundKey = null;
    if (this.isBotMatch()) {
      this.restartPending = true;
      this.modal.setRestartDisabled(true, REINICIANDO);
      this.net.requestRestart();
    } else {
      // PVP ready-check: only the accepter sees "esperando".
      this.rematch = { active: true, voters: [String(this.myId || "")], required: 2 };
      this.rematchCancelledReason = null;
      this.net.requestRematch();
      this.render();
    }
  }

  exitToLobby() {
    this.net?.dispose?.();
    try {
      this.socket?.disconnect?.();
    } catch {}
    try {
      if (window.parent && window.parent !== window && window.parent.cw?.volverDesdeJuego) {
        window.parent.cw.volverDesdeJuego();
        return;
      }
    } catch {}
    window.location.assign("/index.html");
  }

  toggleFullscreen() {
    const el = this.root?.firstElementChild;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        document.exitFullscreen?.();
      } else {
        el.requestFullscreen?.();
      }
    } catch {}
  }
}
