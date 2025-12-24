const BASE_VOL = 0.8;

let unlocked = false;
let supported = true;
let mutedPref = false;

const BASE_URL =
  typeof import.meta !== "undefined" && import.meta.env && import.meta.env.BASE_URL
    ? import.meta.env.BASE_URL
    : "/";
const PUBLIC_AUDIO_BASE = `${String(BASE_URL).replace(/\/?$/, "/")}audio/`;

const AUDIO_SRC = {
  lose: `${PUBLIC_AUDIO_BASE}sfx-defeat5.mp3`,
  paperflip: `${PUBLIC_AUDIO_BASE}sfx-paperflip4.mp3`,
  shuffle: `${PUBLIC_AUDIO_BASE}sfx-suffle.mp3`,
  win: `${PUBLIC_AUDIO_BASE}sfx-victory1.mp3`,
};

let cache = null;
let activeClones = null;

function isBrowserAudioSupported() {
  return typeof window !== "undefined" && typeof window.Audio !== "undefined";
}

function effectiveVolume() {
  return mutedPref ? 0.0 : BASE_VOL;
}

function getCache() {
  if (!supported) return null;
  if (!isBrowserAudioSupported()) {
    supported = false;
    return null;
  }

  if (!cache) {
    try {
      cache = {
        lose: new Audio(AUDIO_SRC.lose),
        win: new Audio(AUDIO_SRC.win),
        shuffle: new Audio(AUDIO_SRC.shuffle),
        paperflip: new Audio(AUDIO_SRC.paperflip),
      };

      activeClones = new Set();
      for (const [key, audio] of Object.entries(cache)) {
        audio.preload = "auto";
        audio.volume = effectiveVolume();
        audio.addEventListener(
          "error",
          () =>
            console.warn(`[UNO][SFX] failed to load (${key})`, {
              src: audio.currentSrc || audio.src,
              error: audio.error || null,
            }),
          { once: true },
        );
        try {
          audio.load();
        } catch {
          // Ignore load() errors
        }
      }
    } catch {
      supported = false;
      cache = null;
      activeClones = null;
      return null;
    }
  }

  return cache;
}

function applyVolumeToAll() {
  const c = getCache();
  if (!c) return;
  const v = effectiveVolume();
  for (const audio of Object.values(c)) audio.volume = v;
  if (activeClones) {
    for (const audio of activeClones) audio.volume = v;
  }
}

export function initSfxFromStorage() {
  try {
    mutedPref = localStorage.getItem("uno_muted") === "1";
  } catch {
    // Ignore errors from localStorage access
  }
  applyVolumeToAll();
}

export function isMuted() {
  return !!mutedPref;
}

export function setMuted(muted) {
  mutedPref = !!muted;
  applyVolumeToAll();
  try {
    localStorage.setItem("uno_muted", mutedPref ? "1" : "0");
  } catch {
    // Ignore errors from localStorage access
  }
}

export async function unlockSfx() {
  // Must be called after a user gesture (click/tap)
  try {
    const c = getCache();
    if (!c) return false;

    for (const audio of Object.values(c)) {
      try {
        audio.load();
      } catch {
        // Ignore load() errors
      }
    }

    // iOS/Safari: silent "unlock" attempt (volume 0), no audible sound.
    try {
      const probe = c.paperflip;
      const prevVolume = probe.volume;
      const prevMuted = probe.muted;
      probe.muted = true;
      probe.volume = 0.0;
      try {
        probe.currentTime = 0;
      } catch {
        // Ignore currentTime reset errors
      }

      try {
        const p = probe.play();
        if (p && typeof p.catch === "function") {
          await p.catch((err) =>
            console.warn("[UNO][SFX] unlock play() blocked/failed", err),
          );
        }
      } catch (err) {
        console.warn("[UNO][SFX] unlock play() threw", err);
      }

      probe.pause();
      try {
        probe.currentTime = 0;
      } catch {
        // Ignore currentTime reset errors
      }
      probe.volume = prevVolume;
      probe.muted = prevMuted;
    } catch {
      // Ignore and keep going
    }

    unlocked = true;
    return true;
  } catch {
    return false;
  }
}

function trackClone(audio) {
  if (!activeClones) return;
  activeClones.add(audio);
  const cleanup = () => activeClones && activeClones.delete(audio);
  audio.addEventListener("ended", cleanup, { once: true });
  audio.addEventListener("pause", cleanup, { once: true });
  audio.addEventListener("error", cleanup, { once: true });
}

function resetAndPlay(audio, label) {
  audio.volume = effectiveVolume();
  try {
    audio.currentTime = 0;
  } catch {
    // Ignore currentTime reset errors
  }
  try {
    const p = audio.play();
    if (p && typeof p.catch === "function") {
      p.catch((err) =>
        console.warn(`[UNO][SFX] play() blocked/failed (${label})`, err),
      );
    }
  } catch (err) {
    console.warn(`[UNO][SFX] play() threw (${label})`, err);
  }
}

function playCached(key, { overlap = false } = {}) {
  if (isMuted()) return;
  const c = getCache();
  if (!c) return;

  if (!unlocked) {
    for (const audio of Object.values(c)) {
      try {
        audio.load();
      } catch {
        // Ignore load() errors
      }
    }
    unlocked = true;
  }

  const audio = c[key];
  if (!audio) return;

  const isPlaying = !audio.paused && !audio.ended && audio.currentTime > 0;
  if (overlap && isPlaying) {
    try {
      const clone = audio.cloneNode(true);
      clone.preload = "auto";
      clone.src = audio.src;
      clone.volume = effectiveVolume();
      trackClone(clone);
      resetAndPlay(clone, key);
      return;
    } catch {
      // Fall back to the shared instance
    }
  }

  resetAndPlay(audio, key);
}

export function sfxDraw() {
  playCached("paperflip", { overlap: true });
}

export function sfxPlayCard() {
  playCached("paperflip", { overlap: true });
}

export function sfxShuffle() {
  playCached("shuffle");
}

export function sfxWin() {
  playCached("win");
}

export function sfxLose() {
  playCached("lose");
}

