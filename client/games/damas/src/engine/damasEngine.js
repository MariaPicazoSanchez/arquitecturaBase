function normalizeId(value) {
  return String(value || "").trim().toLowerCase();
}

export class DamasEngine {
  constructor({ codigo, myPlayerId } = {}) {
    this.codigo = String(codigo || "").trim();
    this.myPlayerId = normalizeId(myPlayerId || "");
    this.state = null;
    this.myColor = null;
    this.selectedFrom = null;
    this.rematch = null;
    this.rematchCancelledReason = null;
    this.restartPending = false;
    this.isReviewingEnd = false;
    this.endSoundKey = null;
  }

  _matchesCode(payload) {
    const code = String(payload?.matchCode || payload?.codigo || "").trim();
    return !!code && code === this.codigo;
  }

  _normalizePlayerId(id) {
    return normalizeId(id || "");
  }

  _updateMyColor() {
    this.myColor = null;
    if (!this.state) return;
    const players = Array.isArray(this.state.players) ? this.state.players : [];
    for (const player of players) {
      if (!player) continue;
      if (this._normalizePlayerId(player.id) === this.myPlayerId) {
        this.myColor = player.color;
        return;
      }
    }
  }

  _resetSelection() {
    this.selectedFrom = null;
  }

  _applyState(st) {
    if (!st) return false;
    this.state = st;
    this.restartPending = false;
    this.rematch = null;
    this.rematchCancelledReason = null;
    this.isReviewingEnd = false;
    this._resetSelection();
    this._updateMyColor();
    return true;
  }

  applyServerState(payload) {
    const st = payload?.statePublic || payload?.state || null;
    return this._applyState(st);
  }

  applyGameState(payload) {
    const st = payload?.state || null;
    return this._applyState(st);
  }

  handleRematchState(payload) {
    if (!this._matchesCode(payload)) return false;
    const active = payload?.active === true;
    const voters = Array.isArray(payload?.voters) ? payload.voters.map((v) => String(v)) : [];
    const required = Number(payload?.required ?? 2);
    this.rematch = { active, voters, required };
    this.rematchCancelledReason = null;
    return true;
  }

  handleRematchCancelled(payload) {
    if (!this._matchesCode(payload)) return false;
    this.rematch = null;
    this.rematchCancelledReason = String(payload?.reason || "player_left");
    return true;
  }

  handleRematchStart(payload) {
    if (!this._matchesCode(payload)) return { handled: false, updated: false };
    const newState = payload?.newState || payload?.state || null;
    let updated = false;
    if (newState) {
      updated = this._applyState(newState);
    }
    this.rematch = null;
    this.rematchCancelledReason = null;
    this.restartPending = false;
    this.isReviewingEnd = false;
    this._resetSelection();
    return { handled: true, updated };
  }

  resetAfterRestart() {
    this.restartPending = false;
    this.rematch = null;
    this.rematchCancelledReason = null;
    this.endSoundKey = null;
    this._resetSelection();
    this.isReviewingEnd = false;
  }

  resetAfterError() {
    this.restartPending = false;
    this.rematch = null;
    this.rematchCancelledReason = null;
  }
}

export function createDamasEngine(params) {
  return new DamasEngine(params);
}
