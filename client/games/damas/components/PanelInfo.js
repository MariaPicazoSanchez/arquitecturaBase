export class PanelInfo {
  constructor({ title, onFullscreen, onExit } = {}) {
    this.el = document.createElement("div");
    this.el.className = "damasPanel card";
    this.el.innerHTML = `
      <div class="card-body damasPanelBody">
        <div class="damasPanelTop">
          <div class="damasTitleWrap">
            <div class="damasTitle"></div>
            <div class="damasSubtitle text-muted"></div>
          </div>

        </div>
        <div class="damasMeta">
          <div class="damasPill" data-role="metaLeft"></div>
          <div class="damasPill" data-role="metaRight"></div>
        </div>
        <div class="damasAlerts">
          <div class="alert alert-info py-2 mb-2 damasAlert" data-role="notice" style="display:none;"></div>
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
    this.errorEl = this.el.querySelector('[data-role="error"]');
    this.countWhiteEl = this.el.querySelector('[data-role="countWhite"]');
    this.countBlackEl = this.el.querySelector('[data-role="countBlack"]');

    this.titleEl.textContent = title || "";

    const btnFull = this.el.querySelector('[data-role="fullscreen"]');
    const btnExit = this.el.querySelector('[data-role="exit"]');

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
    const t = String(text || "");
    if (!t) {
      this.noticeEl.style.display = "none";
      this.noticeEl.textContent = "";
      return;
    }
    this.noticeEl.style.display = "";
    this.noticeEl.textContent = t;
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

