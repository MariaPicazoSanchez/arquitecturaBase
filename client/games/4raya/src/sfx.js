const BASE_VOL = 0.8;

let unlocked = false;
let supported = true;
let mutedPref = false;

const BASE_URL =
  typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL
    ? import.meta.env.BASE_URL
    : '/';
const PUBLIC_AUDIO_BASE = `${String(BASE_URL).replace(/\/?$/, '/') }audio/`;

const AUDIO_SRC = {
  drop: `${PUBLIC_AUDIO_BASE}discs_drop.mp3`,
  lose: `${PUBLIC_AUDIO_BASE}sfx-defeat5.mp3`,
  win: `${PUBLIC_AUDIO_BASE}sfx-victory1.mp3`,
};

let cache = null;
let activeClones = null;

function isBrowserAudioSupported() {
  return typeof window !== 'undefined' && typeof window.Audio !== 'undefined';
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
        drop: new Audio(AUDIO_SRC.drop),
        lose: new Audio(AUDIO_SRC.lose),
        win: new Audio(AUDIO_SRC.win),
      };

      activeClones = new Set();
      for (const [key, audio] of Object.entries(cache)) {
        audio.preload = 'auto';
        audio.volume = effectiveVolume();
        audio.addEventListener(
          'error',
          () =>
            console.warn(`[4RAYA][SFX] failed to load (${key})`, {
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
    const global = localStorage.getItem('uno_muted');
    if (global === '1' || global === '0') {
      mutedPref = global === '1';
    } else {
      // Back-compat: migrate old per-game key once.
      mutedPref = localStorage.getItem('c4_muted') === '1';
      try {
        localStorage.setItem('uno_muted', mutedPref ? '1' : '0');
      } catch {
        // ignore
      }
    }
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
    localStorage.setItem('uno_muted', mutedPref ? '1' : '0');
  } catch {
    // Ignore errors from localStorage access
  }
}

export async function unlockSfx() {
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

    try {
      const probe = c.drop;
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
        if (p && typeof p.catch === 'function') {
          await p.catch(() => {});
        }
      } catch {
        // ignore
      }

      probe.pause();
      try {
        probe.currentTime = 0;
      } catch {
        // ignore
      }
      probe.volume = prevVolume;
      probe.muted = prevMuted;
    } catch {
      // ignore
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
  audio.addEventListener('ended', cleanup, { once: true });
  audio.addEventListener('pause', cleanup, { once: true });
  audio.addEventListener('error', cleanup, { once: true });
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
    if (p && typeof p.catch === 'function') {
      p.catch((err) => console.warn(`[4RAYA][SFX] play() blocked/failed (${label})`, err));
    }
  } catch (err) {
    console.warn(`[4RAYA][SFX] play() threw (${label})`, err);
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
      clone.preload = 'auto';
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

export function sfxDrop() {
  playCached('drop', { overlap: true });
}

export function sfxWin() {
  playCached('win');
}

export function sfxLose() {
  playCached('lose');
}
