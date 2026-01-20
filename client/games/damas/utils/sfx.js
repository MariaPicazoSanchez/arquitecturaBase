async function firstReachableUrl(urls) {
  for (const url of urls) {
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (res && res.ok) return url;
    } catch {
      // ignore
    }
  }
  return null;
}

export function createSfx() {
  const supported = typeof window !== "undefined" && typeof window.Audio !== "undefined";
  let unlocked = false;
  let mutedPref = false;
  let win = null;
  let lose = null;

  const candidates = {
    win: ["/audio/sfx-victory1.mp3", "/4raya/audio/sfx-victory1.mp3", "/uno/audio/sfx-victory1.mp3"],
    lose: ["/audio/sfx-defeat5.mp3", "/4raya/audio/sfx-defeat5.mp3", "/uno/audio/sfx-defeat5.mp3"],
  };

  async function init() {
    if (!supported) return;
    const [winUrl, loseUrl] = await Promise.all([
      firstReachableUrl(candidates.win),
      firstReachableUrl(candidates.lose),
    ]);

    if (winUrl) {
      win = new Audio(winUrl);
      win.preload = "auto";
      win.volume = 0.85;
      try {
        win.load();
      } catch {}
    }
    if (loseUrl) {
      lose = new Audio(loseUrl);
      lose.preload = "auto";
      lose.volume = 0.85;
      try {
        lose.load();
      } catch {}
    }
  }

  function initSfxFromStorage() {
    try {
      mutedPref = localStorage.getItem("uno_muted") === "1";
    } catch {
      // ignore
    }
  }

  function isMuted() {
    return !!mutedPref;
  }

  function setMuted(muted) {
    mutedPref = !!muted;
    try {
      localStorage.setItem("uno_muted", mutedPref ? "1" : "0");
    } catch {
      // ignore
    }

    // Best-effort: stop any currently playing sounds.
    for (const a of [win, lose]) {
      try {
        if (a) a.pause();
      } catch {}
    }
  }

  function unlock() {
    if (!supported || unlocked) return;
    unlocked = true;
    const a = win || lose;
    if (!a) return;
    try {
      const prevMuted = a.muted;
      const prevVol = a.volume;
      a.muted = true;
      a.volume = 0;
      a.currentTime = 0;
      const p = a.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
      a.pause();
      a.muted = prevMuted;
      a.volume = prevVol;
    } catch {
      // ignore
    }
  }

  function playOnce(a) {
    if (isMuted()) return;
    if (!a || !supported) return;
    try {
      a.currentTime = 0;
    } catch {}
    try {
      const p = a.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {}
  }

  return {
    init,
    initSfxFromStorage,
    unlock,
    isMuted,
    setMuted,
    playWin: () => playOnce(win),
    playLose: () => playOnce(lose),
  };
}
