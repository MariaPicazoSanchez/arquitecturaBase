(function () {
  const DEFAULT_TIMEOUT_MS = 6500;

  function ensureHost() {
    let host = document.getElementById("app-toast-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "app-toast-host";
      document.body.appendChild(host);
    }
    return host;
  }

  function normalizeVariant(variant) {
    const v = String(variant || "").trim().toLowerCase();
    if (v === "success" || v === "warning" || v === "error" || v === "info") return v;
    return "info";
  }

  function show(message, options) {
    const opts = options && typeof options === "object" ? options : {};
    const variant = normalizeVariant(opts.variant);
    const timeoutMs =
      Number.isFinite(Number(opts.timeoutMs)) && Number(opts.timeoutMs) > 0
        ? Number(opts.timeoutMs)
        : DEFAULT_TIMEOUT_MS;

    const host = ensureHost();

    const toast = document.createElement("div");
    toast.className = `tr-toast tr-toast--${variant}`;
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    toast.setAttribute("aria-atomic", "true");

    const body = document.createElement("div");
    body.className = "tr-toast__body";
    body.textContent = String(message || "");

    const close = document.createElement("button");
    close.type = "button";
    close.className = "tr-toast__close";
    close.setAttribute("aria-label", "Cerrar");
    close.textContent = "×";

    toast.appendChild(body);
    toast.appendChild(close);
    host.appendChild(toast);

    let dismissed = false;
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      toast.classList.remove("tr-toast--in");
      toast.classList.add("tr-toast--out");
      setTimeout(() => {
        try {
          toast.remove();
        } catch (e) {}
      }, 220);
    };

    close.addEventListener("click", (e) => {
      e?.preventDefault?.();
      dismiss();
    });

    // Animate in
    requestAnimationFrame(() => toast.classList.add("tr-toast--in"));

    // Auto dismiss
    setTimeout(dismiss, timeoutMs);

    return { dismiss };
  }

  window.appToast = window.appToast || {};
  window.appToast.show = show;
})();

