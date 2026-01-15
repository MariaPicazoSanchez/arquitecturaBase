const isDevEnv = process.env.NODE_ENV !== "production";

const makeLogger = (fn, level, allowInProd = false) => {
  if (!fn) return () => {};
  if (!allowInProd && !isDevEnv) {
    return () => {};
  }
  return (...args) => {
    try {
      fn.apply(console, [`[SISTEMA]`, `[${level}]`, ...args]);
    } catch (err) {
      // fall through silently
    }
  };
};

module.exports = {
  debug: makeLogger(console.debug || console.log, "DEBUG"),
  info: makeLogger(console.info || console.log, "INFO"),
  warn: makeLogger(console.warn || console.log, "WARN", true),
  error: makeLogger(console.error || console.log, "ERROR", true),
  isDev: isDevEnv,
};
