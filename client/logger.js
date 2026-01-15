(function (global) {
  const envNode = global.APP_CONFIG && global.APP_CONFIG.NODE_ENV;
  const env = typeof envNode === "string" ? envNode : "development";
  const isDev = env !== "production";
  const safeLog = (fn, level) => {
    if (!fn) return () => {};
    return function () {
      if (!isDev && (level === "debug" || level === "info")) return;
      try {
        fn.apply(console, ["[SISTEMA]", ...arguments]);
      } catch (err) {
        // Fall back silently if console methods no longer exist.
      }
    };
  };

  const boundDebug = safeLog(console.debug || console.log, "debug");
  const boundInfo = safeLog(console.info || console.log, "info");
  const boundWarn = safeLog(console.warn || console.log, "warn");
  const boundError = safeLog(console.error || console.log, "error");

  global.logger = {
    debug: boundDebug,
    info: boundInfo,
    warn: boundWarn,
    error: boundError,
  };
})(window);
