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
    this.codigo = null;
    this.email = null;
    this.myId = null;

    this.state = null; // statePublic del servidor
    this.myColor = null; // "white"|"black"|null
    this.selectedFrom = null;
    this.endSoundKey = null;
    this.restartPending = false;
    this.rematch = null; // { active, voters: [uid], required }
    this.rematchCancelledReason = null;
    this.isMuted = false;
    this.isReviewingEnd = false;
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

    this.socket = window.io(window.location.origin, {
      path: "/socket.io",
      withCredentials: true,
    });

    this.socket.on("connect", () => {
      this.panel.setError("");
      this.panel.setSubtitle(CONECTADO_ESPERANDO);
      const join = () => {
        this.socket.emit("damas_join", { codigo: this.codigo, email: this.email });
      };

      let settled = false;
      const t = setTimeout(() => {
        if (settled) return;
        settled = true;
        join();
      }, 1200);

      this.socket.emit(
        "game:resume",
        { gameType: "damas", gameId: this.codigo, email: this.email },
        (res) => {
          if (settled) return;
          settled = true;
          clearTimeout(t);
          if (res && res.ok) return;
          join();
        }
      );

      this._clearStateTimers();
      this._stateWaitTimer = setTimeout(() => {
        if (this.state) return;
        this.requestState({ silent: true });
      }, 1400);
      this._stateErrorTimer = setTimeout(() => {
        if (this.state) return;
        this.requestState({
          silent: true,
          onResult: (res) => {
            if (this.state) return;
            const reason = res && res.reason ? String(res.reason) : "NO_RESPONSE";
            this.panel.setNotice({
              text: reason === "WAITING_FOR_PLAYERS" ? "Esperando al otro jugador..." : "No llega el estado. Puedes reintentar.",
              actionLabel: "Reintentar",
              onAction: () => this.requestState({ silent: false }),
            });
          },
        });
      }, 2600);
    });

    this.socket.on("damas_state", (payload) => {
      if (!payload || payload.codigo !== this.codigo) return;
      const st = payload.statePublic || payload.state || null;
      if (!st) return;
      this.state = st;
      this.restartPending = false;
      this.rematch = null;
      this.rematchCancelledReason = null;
      this.selectedFrom = null;
      this.isReviewingEnd = false;
      this._clearStateTimers();
      this.render();
    });

    this.socket.on("game:state", (payload) => {
      const code = String(payload?.matchCode || payload?.codigo || "").trim();
      const key = String(payload?.gameKey || "").trim().toLowerCase();
      if (!code || code !== String(this.codigo)) return;
      if (key && key !== "damas" && key !== "checkers") return;
      const st = payload?.state || null;
      if (!st) return;
      this.state = st;
      this.restartPending = false;
      this.rematch = null;
      this.rematchCancelledReason = null;
      this.selectedFrom = null;
      this.isReviewingEnd = false;
      this._clearStateTimers();
      this.render();
    });

    const onRematchState = (payload) => {
      const code = String(payload?.matchCode || payload?.codigo || "").trim();
      if (!code || code !== String(this.codigo)) return;
      const active = payload?.active === true;
      const voters = Array.isArray(payload?.voters) ? payload.voters.map((v) => String(v)) : [];
      const required = Number(payload?.required ?? 2);
      this.rematch = { active, voters, required };
      this.rematchCancelledReason = null;
      this.render();
    };
    this.socket.on("checkers:rematch_state", onRematchState);
    this.socket.on("damas:rematch_state", onRematchState);

    const onRematchCancelled = (payload) => {
      const code = String(payload?.matchCode || payload?.codigo || "").trim();
      if (!code || code !== String(this.codigo)) return;
      this.rematch = null;
      this.rematchCancelledReason = String(payload?.reason || "player_left");
      this.render();
    };
    this.socket.on("checkers:rematch_cancelled", onRematchCancelled);
    this.socket.on("damas:rematch_cancelled", onRematchCancelled);

    const onRematchStart = (payload) => {
      const code = String(payload?.matchCode || payload?.codigo || "").trim();
      if (!code || code !== String(this.codigo)) return;
      const newState = payload?.newState || payload?.state || null;
      if (newState) {
        this.state = newState;
        this.selectedFrom = null;
        this._clearStateTimers();
      }
      this.rematch = null;
      this.rematchCancelledReason = null;
      this.restartPending = false;
      this.modal.hide();
      this.render();
    };
    this.socket.on("checkers:rematch_start", onRematchStart);
    this.socket.on("damas:rematch_start", onRematchStart);

    this.socket.on("damas_restart", (payload) => {
      if (!payload || payload.codigo !== this.codigo) return;
      if (payload.newCodigo) {
        const nextUrl = `${window.location.origin}/damas?codigo=${encodeURIComponent(payload.newCodigo)}`;
        window.location.assign(nextUrl);
        return;
      }
      this.restartPending = false;
      this.rematch = null;
      this.rematchCancelledReason = null;
      this.endSoundKey = null;
      this.selectedFrom = null;
      this.isReviewingEnd = false;
      this.modal.hide();
      this.render();
    });

    this.socket.on("damas_error", (payload) => {
      if (!payload || payload.codigo !== this.codigo) return;
      this.restartPending = false;
      this.rematch = null;
      this.rematchCancelledReason = null;
      const msg = payload.message || "Movimiento inválido.";
      this.panel.setError(msg);
      this.render();
    });

    this.socket.on("connect_error", () => {
      this.panel.setError(ERROR_CONEXION);
      this.panel.setSubtitle(ERROR_CONEXION);
    });
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
    if (!this.socket || !this.codigo || !this.email) return;
    if (!silent) {
      this.panel.setNotice({
        text: "Reintentando estado...",
        actionLabel: "Reintentar",
        onAction: () => this.requestState({ silent: false }),
      });
    }
    this.socket.emit(
      "game:get_state",
      { matchCode: this.codigo, gameKey: "damas", email: this.email },
      (res) => {
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
      }
    );
  }

  updateMyColor() {
    const players = Array.isArray(this.state?.players) ? this.state.players : [];
    this.myColor = null;
    for (const p of players) {
      if (!p) continue;
      if (normalizeId(p.id) !== this.myId) continue;
      this.myColor = p.color;
      break;
    }
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
    this.updateMyColor();

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
        this.socket?.emit("damas_move", {
          codigo: this.codigo,
          email: this.email,
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
    if (!this.socket || !this.codigo || !this.email) return;
    if (!this.state || this.state.status !== "finished") return;
    this.endSoundKey = null;
    if (this.isBotMatch()) {
      this.restartPending = true;
      this.modal.setRestartDisabled(true, REINICIANDO);
      this.socket.emit("damas_restart", { codigo: this.codigo, email: this.email });
    } else {
      // PVP ready-check: only the accepter sees "esperando".
      this.rematch = { active: true, voters: [String(this.myId || "")], required: 2 };
      this.rematchCancelledReason = null;
      this.socket.emit("checkers:rematch_request", {
        matchCode: this.codigo,
        codigo: this.codigo,
        email: this.email,
      });
      this.render();
    }
  }

  exitToLobby() {
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
