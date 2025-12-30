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

    this.sfx = createSfx();

    this.panel = new PanelInfo({
      title: DAMAS,
      onFullscreen: () => this.toggleFullscreen(),
      onExit: () => this.exitToLobby(),
    });

    this.board = new TableroDamas({
      onCellClick: (r, c) => this.onCellClick(r, c),
      onUserGesture: () => this.sfx.unlock(),
    });

    this.modal = new ModalFinal({
      onRestart: () => this.requestRestart(),
      onExit: () => this.exitToLobby(),
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

    page.appendChild(header);
    page.appendChild(main);
    page.appendChild(footer);
    page.appendChild(this.modal.el);

    this.root.appendChild(page);

    this.init();
  }

  init() {
    this.codigo = parseCodigoFromUrl();
    this.email = resolveNickOrEmail();
    this.myId = normalizeId(this.email);

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

    this.socket = window.io(window.location.origin, {
      path: "/socket.io",
      withCredentials: true,
    });

    this.socket.on("connect", () => {
      this.panel.setError("");
      this.panel.setSubtitle(CONECTADO_ESPERANDO);
      this.socket.emit("damas_join", { codigo: this.codigo, email: this.email });
    });

    this.socket.on("damas_state", (payload) => {
      if (!payload || payload.codigo !== this.codigo) return;
      const st = payload.statePublic || payload.state || null;
      if (!st) return;
      this.state = st;
      this.restartPending = false;
      this.selectedFrom = null;
      this.render();
    });

    this.socket.on("damas_restart", (payload) => {
      if (!payload || payload.codigo !== this.codigo) return;
      this.restartPending = false;
      this.endSoundKey = null;
      this.selectedFrom = null;
      this.modal.hide();
      this.render();
    });

    this.socket.on("damas_error", (payload) => {
      if (!payload || payload.codigo !== this.codigo) return;
      this.restartPending = false;
      const msg = payload.message || "Movimiento inválido.";
      this.panel.setError(msg);
      this.render();
    });

    this.socket.on("connect_error", () => {
      this.panel.setError(ERROR_CONEXION);
      this.panel.setSubtitle(ERROR_CONEXION);
    });
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

    this.board.render({
      board: this.state.board,
      selectedFrom: this.selectedFrom,
      destinations: dests,
      forcedFrom: this.state.forcedFrom,
      disabled: !this.isMyTurn(),
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
      this.modal.show({
        title: DAMAS,
        result: this.myColor && this.state.winner === this.myColor ? GANASTE : PERDISTE,
        winnerName: this.state.winnerName || "—",
        loserName: this.state.loserName || "—",
        restartText: this.restartPending ? REINICIANDO : JUGAR_OTRA,
        canRestart: !this.restartPending,
        exitText: SALIR,
      });
    } else {
      this.modal.hide();
      this.endSoundKey = null;
    }
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
    this.restartPending = true;
    this.endSoundKey = null;
    this.modal.setRestartDisabled(true, REINICIANDO);
    this.socket.emit("damas_restart", { codigo: this.codigo, email: this.email });
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

