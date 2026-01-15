export class PanelInfo {
  constructor({ title, onFullscreen, onExit, onToggleMute } = {}) {
    this.el = document.createElement("div");
    this.el.className = "damasPanel card";
    this.el.innerHTML = `
      <div class="card-body damasPanelBody">
        <div class="damasPanelTop">
          <div class="damasTitleWrap">
            <div class="damasTitle"></div>
            <div class="damasSubtitle text-muted"></div>
          </div>
          <div class="damasHeaderBtns">
            <button
              type="button"
              class="damas-mute-toggle"
              data-role="mute"
              aria-label="Silenciar"
              title="Silenciar"
            >🔊</button>
          </div>
        </div>
        <div class="damasMeta">
          <div class="damasPill" data-role="metaLeft"></div>
          <div class="damasPill" data-role="metaRight"></div>
        </div>
        <div class="damasAlerts">
          <div class="alert alert-info py-2 mb-2 damasAlert" data-role="notice" style="display:none;">
            <span data-role="noticeText"></span>
            <button type="button" class="btn btn-sm btn-outline-light ml-2" data-role="noticeAction" style="display:none;">Reintentar</button>
          </div>
          <div class="alert alert-danger py-2 mb-0 damasAlert" data-role="error" style="display:none;"></div>
        </div>
        <div class="damasStats">
          <div class="damasTurn" data-role="turn"></div>
          <div class="damasCounts">
            <span class="badge badge-light damasBadge" data-role="countWhite"></span>
            <span class="badge badge-dark damasBadge" data-role="countBlack"></span>
          </div>
        </div>
      </div>
    `;

    this.titleEl = this.el.querySelector(".damasTitle");
    this.subtitleEl = this.el.querySelector(".damasSubtitle");
    this.turnEl = this.el.querySelector('[data-role="turn"]');
    this.metaLeftEl = this.el.querySelector('[data-role="metaLeft"]');
    this.metaRightEl = this.el.querySelector('[data-role="metaRight"]');
    this.noticeEl = this.el.querySelector('[data-role="notice"]');
    this.noticeTextEl = this.el.querySelector('[data-role="noticeText"]');
    this.noticeActionBtn = this.el.querySelector('[data-role="noticeAction"]');
    this.errorEl = this.el.querySelector('[data-role="error"]');
    this.countWhiteEl = this.el.querySelector('[data-role="countWhite"]');
    this.countBlackEl = this.el.querySelector('[data-role="countBlack"]');
    this.muteBtn = this.el.querySelector('[data-role="mute"]');

    this.titleEl.textContent = title || "";

    const btnFull = this.el.querySelector('[data-role="fullscreen"]');
    const btnExit = this.el.querySelector('[data-role="exit"]');

    if (this.muteBtn) {
      this.muteBtn.addEventListener("click", (e) => {
        e?.preventDefault?.();
        e?.stopPropagation?.();
        onToggleMute?.();
      });
    }
  }

  setMuted(isMuted) {
    if (!this.muteBtn) return;
    const muted = !!isMuted;
    this.muteBtn.classList.toggle("damas-mute-toggle--muted", muted);
    this.muteBtn.textContent = muted ? "🔇" : "🔊";
    this.muteBtn.setAttribute("aria-label", muted ? "Activar sonido" : "Silenciar");
    this.muteBtn.setAttribute("title", muted ? "Activar sonido" : "Silenciar");
  }

  setSubtitle(text) {
    if (!this.subtitleEl) return;
    this.subtitleEl.textContent = String(text || "");
  }

  setTurnLabel(text) {
    if (!this.turnEl) return;
    this.turnEl.textContent = String(text || "");
  }

  setMetaLeft(text) {
    if (!this.metaLeftEl) return;
    this.metaLeftEl.textContent = String(text || "");
    this.metaLeftEl.style.display = text ? "" : "none";
  }

  setMetaRight(text) {
    if (!this.metaRightEl) return;
    this.metaRightEl.textContent = String(text || "");
    this.metaRightEl.style.display = text ? "" : "none";
  }

  setNotice(text) {
    if (!this.noticeEl) return;
    const opts = text && typeof text === "object" ? text : { text };
    const t = String(opts?.text || "");
    if (!t) {
      this.noticeEl.style.display = "none";
      if (this.noticeTextEl) this.noticeTextEl.textContent = "";
      if (this.noticeActionBtn) this.noticeActionBtn.style.display = "none";
      return;
    }
    this.noticeEl.style.display = "";
    if (this.noticeTextEl) this.noticeTextEl.textContent = t;

    const label = String(opts?.actionLabel || "");
    const onAction = typeof opts?.onAction === "function" ? opts.onAction : null;
    if (this.noticeActionBtn && label && onAction) {
      this.noticeActionBtn.textContent = label;
      this.noticeActionBtn.style.display = "";
      this.noticeActionBtn.onclick = (e) => {
        e?.preventDefault?.();
        e?.stopPropagation?.();
        onAction();
      };
    } else if (this.noticeActionBtn) {
      this.noticeActionBtn.style.display = "none";
      this.noticeActionBtn.onclick = null;
    }
  }

  setError(text) {
    if (!this.errorEl) return;
    const t = String(text || "");
    if (!t) {
      this.errorEl.style.display = "none";
      this.errorEl.textContent = "";
      return;
    }
    this.errorEl.style.display = "";
    this.errorEl.textContent = t;
  }

  setCounts({ white, black } = {}) {
    if (this.countWhiteEl) this.countWhiteEl.textContent = `Blancas: ${Number(white || 0)}`;
    if (this.countBlackEl) this.countBlackEl.textContent = `Negras: ${Number(black || 0)}`;
  }
}
