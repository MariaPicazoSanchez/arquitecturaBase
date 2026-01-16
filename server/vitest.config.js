const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    environment: 'node',
    globals: true,
    passWithNoTests: false,
    include: ['test/**/*.test.js', 'game/**/*.test.js'],
    setupFiles: [],
  },
});
