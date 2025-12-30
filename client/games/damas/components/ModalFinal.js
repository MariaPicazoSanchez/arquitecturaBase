export class ModalFinal {
  constructor({ onRestart, onExit } = {}) {
    this.onRestartCb = onRestart;
    this.onExitCb = onExit;

    this.el = document.createElement("div");
    this.el.className = "damasModalOverlay";
    this.el.style.display = "none";
    this.el.setAttribute("aria-hidden", "true");
    this.el.innerHTML = `
      <div class="damasModalCard" role="dialog" aria-modal="true" aria-label="Fin de partida">
        <div class="damasModalTitle" data-role="title"></div>
        <div class="damasModalBody">
          <div class="damasModalResult" data-role="result"></div>
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
          <button type="button" class="btn btn-outline-secondary" data-role="exit"></button>
        </div>
      </div>
    `;

    this.titleEl = this.el.querySelector('[data-role="title"]');
    this.resultEl = this.el.querySelector('[data-role="result"]');
    this.winnerNameEl = this.el.querySelector('[data-role="winnerName"]');
    this.loserNameEl = this.el.querySelector('[data-role="loserName"]');
    this.restartBtn = this.el.querySelector('[data-role="restart"]');
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

    this.el.addEventListener("click", (e) => {
      if (e.target === this.el) this.onExitCb?.();
    });
  }

  show({ title, result, winnerName, loserName, restartText, canRestart, exitText } = {}) {
    this.titleEl.textContent = String(title || "");
    this.resultEl.textContent = String(result || "");
    this.winnerNameEl.textContent = String(winnerName || "—");
    this.loserNameEl.textContent = String(loserName || "—");
    this.restartBtn.textContent = String(restartText || "");
    this.restartBtn.disabled = canRestart === false;
    this.exitBtn.textContent = String(exitText || "");
    this.el.style.display = "";
    this.el.setAttribute("aria-hidden", "false");
  }

  hide() {
    this.el.style.display = "none";
    this.el.setAttribute("aria-hidden", "true");
  }

  setRestartDisabled(disabled, text) {
    if (typeof text === "string") this.restartBtn.textContent = text;
    this.restartBtn.disabled = !!disabled;
  }
}

