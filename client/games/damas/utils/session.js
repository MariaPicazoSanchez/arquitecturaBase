export function parseCodigoFromUrl() {
  try {
    return new URLSearchParams(window.location.search).get("codigo");
  } catch {
    return null;
  }
}

function getCookieValue(cookieStr, name) {
  const parts = String(cookieStr || "")
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean);
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx);
    const v = part.slice(idx + 1);
    if (k === name) return decodeURIComponent(v);
  }
  return null;
}

export function resolveNickOrEmail() {
  const localCookie = typeof document !== "undefined" ? document.cookie : "";
  const direct = getCookieValue(localCookie, "nick") || getCookieValue(localCookie, "email");
  if (direct) return direct;

  try {
    const parentCookie = window.parent?.document?.cookie || "";
    return getCookieValue(parentCookie, "nick") || getCookieValue(parentCookie, "email") || null;
  } catch {
    return null;
  }
}

