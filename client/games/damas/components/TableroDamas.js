import { observeSquareSize } from "../utils/responsiveBoard.js";

function isDarkSquare(r, c) {
  return ((r + c) & 1) === 1;
}

export class TableroDamas {
  constructor({ onCellClick, onUserGesture } = {}) {
    this.onCellClickCb = onCellClick;
    this.onUserGestureCb = onUserGesture;

    this.el = document.createElement("div");
    this.el.className = "damasBoardWrap";
    this.el.innerHTML = `
      <div class="damasBoardSizer" data-role="sizer">
        <div class="damasBoard" data-role="board" role="grid" aria-label="Tablero de Damas 8x8"></div>
      </div>
    `;
    this.sizerEl = this.el.querySelector('[data-role="sizer"]');
    this.boardEl = this.el.querySelector('[data-role="board"]');

    this.cells = [];

    this.boardEl.addEventListener("pointerdown", () => this.onUserGestureCb?.(), {
      passive: true,
    });

    this.boardEl.addEventListener("click", (e) => {
      const btn = e.target?.closest?.("button[data-r][data-c]");
      if (!btn) return;
      const r = Number.parseInt(btn.dataset.r, 10);
      const c = Number.parseInt(btn.dataset.c, 10);
      if (!Number.isFinite(r) || !Number.isFinite(c)) return;
      this.onCellClickCb?.(r, c);
    });

    this.buildOnce();
    this.cleanup = observeSquareSize(this.el, (sizePx) => {
      this.sizerEl.style.width = `${sizePx}px`;
      this.sizerEl.style.height = `${sizePx}px`;
      this.sizerEl.style.setProperty("--cell", `${sizePx / 8}px`);
    });
  }

  buildOnce() {
    this.boardEl.innerHTML = "";
    for (let r = 0; r < 8; r++) {
      this.cells[r] = [];
      for (let c = 0; c < 8; c++) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className =
          "damasCell " + (isDarkSquare(r, c) ? "damasCell--dark" : "damasCell--light");
        btn.setAttribute("role", "gridcell");
        btn.dataset.r = String(r);
        btn.dataset.c = String(c);
        this.boardEl.appendChild(btn);
        this.cells[r][c] = btn;
      }
    }
  }

  render({ board, selectedFrom, destinations, forcedFrom, disabled, pieceRenderer } = {}) {
    const dests = destinations instanceof Set ? destinations : new Set();
    const rows = Array.isArray(board) ? board : [];

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const cell = this.cells?.[r]?.[c];
        if (!cell) continue;

        const dark = isDarkSquare(r, c);
        cell.disabled = !dark || !!disabled;

        cell.classList.toggle(
          "damasCell--selected",
          !!selectedFrom && selectedFrom.r === r && selectedFrom.c === c,
        );
        cell.classList.toggle(
          "damasCell--forced",
          !!forcedFrom && forcedFrom.r === r && forcedFrom.c === c,
        );
        cell.classList.toggle("damasCell--dest", dests.has(`${r},${c}`));

        const piece = rows?.[r]?.[c] ?? 0;
        cell.innerHTML = "";
        const rendered = pieceRenderer?.(piece);
        if (!rendered) continue;

        const ficha = document.createElement("div");
        ficha.className =
          "damasFicha " +
          (rendered.owner === "white" ? "damasFicha--blanca" : "damasFicha--negra");
        if (rendered.crowned) ficha.classList.add("damasFicha--coronada");
        cell.appendChild(ficha);
      }
    }
  }

  destroy() {
    try {
      this.cleanup?.();
    } catch {}
  }
}
