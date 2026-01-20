export class ModalFinal {
  constructor({ onRestart, onExit, onViewBoard } = {}) {
    this.onRestartCb = onRestart;
    this.onExitCb = onExit;
    this.onViewBoardCb = onViewBoard;

    this.el = document.createElement("div");
    this.el.className = "damasModalOverlay";
    this.el.style.display = "none";
    this.el.setAttribute("aria-hidden", "true");
    this.el.innerHTML = `
      <div class="damasModalCard" role="dialog" aria-modal="true" aria-label="Fin de partida">
        <div class="damasModalTitle" data-role="title"></div>
        <div class="damasModalBody">
          <div class="damasModalResult" data-role="result"></div>
          <div class="damasModalHint text-muted" data-role="hint" style="display:none;"></div>
          <div class="damasModalNames">
            <div class="damasModalLine">
              <span class="damasModalLabel">Ganador:</span>
              <span class="damasModalValue" data-role="winnerName">—</span>
            </div>
            <div class="damasModalLine">
              <span class="damasModalLabel">Perdedor:</span>
              <span class="damasModalValue" data-role="loserName">—</span>
            </div>
          </div>
        </div>
        <div class="damasModalActions">
          <button type="button" class="btn btn-primary" data-role="restart"></button>
          <button type="button" class="btn btn-outline-light" data-role="view" style="display:none;"></button>
          <button type="button" class="btn btn-outline-secondary" data-role="exit"></button>
        </div>
      </div>
    `;

    this.titleEl = this.el.querySelector('[data-role="title"]');
    this.resultEl = this.el.querySelector('[data-role="result"]');
    this.hintEl = this.el.querySelector('[data-role="hint"]');
    this.winnerNameEl = this.el.querySelector('[data-role="winnerName"]');
    this.loserNameEl = this.el.querySelector('[data-role="loserName"]');
    this.restartBtn = this.el.querySelector('[data-role="restart"]');
    this.viewBtn = this.el.querySelector('[data-role="view"]');
    this.exitBtn = this.el.querySelector('[data-role="exit"]');

    this.restartBtn.addEventListener("click", (e) => {
      e?.preventDefault?.();
      if (this.restartBtn.disabled) return;
      this.onRestartCb?.();
    });
    this.exitBtn.addEventListener("click", (e) => {
      e?.preventDefault?.();
      this.onExitCb?.();
    });
    this.viewBtn.addEventListener("click", (e) => {
      e?.preventDefault?.();
      if (this.viewBtn.disabled) return;
      this.onViewBoardCb?.();
    });

    this.el.addEventListener("click", (e) => {
      if (e.target === this.el) this.onExitCb?.();
    });
  }

  show({
    title,
    result,
    winnerName,
    loserName,
    hintText,
    restartText,
    canRestart,
    exitText,
    viewText,
    canView,
  } = {}) {
    this.titleEl.textContent = String(title || "");
    this.resultEl.textContent = String(result || "");
    const hint = String(hintText || "");
    if (this.hintEl) {
      this.hintEl.textContent = hint;
      this.hintEl.style.display = hint ? "" : "none";
    }
    this.winnerNameEl.textContent = String(winnerName || "—");
    this.loserNameEl.textContent = String(loserName || "—");
    const restartLabel = String(restartText || "");
    if (!restartLabel) {
      this.restartBtn.style.display = "none";
    } else {
      this.restartBtn.style.display = "";
      this.restartBtn.textContent = restartLabel;
      this.restartBtn.disabled = canRestart === false;
    }

    const viewLabel = String(viewText || "");
    if (viewLabel) {
      this.viewBtn.textContent = viewLabel;
      this.viewBtn.disabled = canView === false;
      this.viewBtn.style.display = "";
    } else {
      this.viewBtn.style.display = "none";
    }

    this.exitBtn.textContent = String(exitText || "");
    this.el.style.display = "";
    this.el.setAttribute("aria-hidden", "false");
  }

  hide() {
    this.el.style.display = "none";
    this.el.setAttribute("aria-hidden", "true");
  }

  setRestartDisabled(disabled, text) {
    if (typeof text === "string") {
      this.restartBtn.textContent = text;
      this.restartBtn.style.display = text ? "" : "none";
    }
    this.restartBtn.disabled = !!disabled;
  }
}
