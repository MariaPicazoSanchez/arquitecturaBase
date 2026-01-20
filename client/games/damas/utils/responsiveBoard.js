export function observeSquareSize(containerEl, onSize) {
  if (!containerEl || typeof onSize !== "function") return () => {};
  if (typeof ResizeObserver === "undefined") return () => {};

  let last = 0;
  const compute = () => {
    const rect = containerEl.getBoundingClientRect();
    const padding = 8;
    const size = Math.max(160, Math.floor(Math.min(rect.width, rect.height) - padding));
    if (size === last) return;
    last = size;
    onSize(size);
  };

  const ro = new ResizeObserver(() => compute());
  ro.observe(containerEl);
  compute();
  return () => ro.disconnect();
}

