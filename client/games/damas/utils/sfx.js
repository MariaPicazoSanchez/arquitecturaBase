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
  let win = null;
  let lose = null;

  const candidates = {
    win: ["/audio/win.mp3", "/4raya/audio/sfx-victory1.mp3", "/uno/audio/sfx-victory1.mp3"],
    lose: ["/audio/lose.mp3", "/4raya/audio/sfx-defeat5.mp3", "/uno/audio/sfx-defeat5.mp3"],
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
    unlock,
    playWin: () => playOnce(win),
    playLose: () => playOnce(lose),
  };
}

