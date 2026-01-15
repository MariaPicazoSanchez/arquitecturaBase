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

  const email = getCookieValue(localCookie, "email");
  if (email) return email;

  // Back-compat: antes la cookie `nick` podía guardar el email.
  const legacyNick = getCookieValue(localCookie, "nick");
  if (legacyNick && legacyNick.includes("@")) return legacyNick;

  try {
    const parentCookie = window.parent?.document?.cookie || "";
    const parentEmail = getCookieValue(parentCookie, "email");
    if (parentEmail) return parentEmail;
    const parentNick = getCookieValue(parentCookie, "nick");
    if (parentNick && parentNick.includes("@")) return parentNick;
    return null;
  } catch {
    return null;
  }
}
