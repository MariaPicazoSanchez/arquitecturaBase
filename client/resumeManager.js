(() => {
  const STORAGE_KEY = "resumeRoom";
  const LEGACY_KEY = "activeMatch";

  const safeParse = (value) => {
    try {
      return value ? JSON.parse(value) : null;
    } catch (e) {
      return null;
    }
  };

  const write = (entry) => {
    try {
      if (!entry) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
      localStorage.removeItem(LEGACY_KEY);
    } catch (e) {}
  };

  const migrateLegacy = () => {
    const legacy = safeParse(localStorage.getItem(LEGACY_KEY));
    if (!legacy) return null;
    const { matchCode, gameKey, creatorNick } = legacy;
    if (!matchCode || !gameKey) return null;
    const ownerNick = creatorNick || legacy.creator || "";
    const timestamp = Date.now();
    const entry = {
      roomId: String(matchCode || "").trim(),
      gameKey: String(gameKey || "").trim().toLowerCase(),
      ownerNick: String(ownerNick || "").trim(),
      joinedNick: "",
      timestamp,
      metadata: legacy.metadata || null,
    };
    try {
      localStorage.removeItem(LEGACY_KEY);
    } catch (e) {}
    write(entry);
    return entry;
  };

  const resumeManager = {
    save(entry) {
      if (!entry || !entry.roomId) return;
      const payload = {
        roomId: String(entry.roomId || "").trim(),
        gameKey: String(entry.gameKey || "").trim().toLowerCase(),
        ownerNick: String(entry.ownerNick || "").trim(),
        joinedNick: String(entry.joinedNick || "").trim(),
        timestamp: entry.timestamp || Date.now(),
        metadata: entry.metadata || null,
      };
      write(payload);
    },
    get() {
      const raw = safeParse(localStorage.getItem(STORAGE_KEY));
      if (raw && raw.roomId) return raw;
      return migrateLegacy();
    },
    clear() {
      write(null);
    },
  };

  window.resumeManager = resumeManager;
})();
