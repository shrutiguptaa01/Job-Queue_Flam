// src/util.js
const { DEFAULTS } = require("./config");

/**
 * compute backoff delay in seconds
 * attempts: integer (1 means first attempt already done)
 */
function computeBackoff(base, attempts, cap) {
  const b = base ?? DEFAULTS.backoff_base;
  const c = cap ?? DEFAULTS.backoff_cap;
  const delay = Math.pow(b, attempts);
  return Math.min(delay, c);
}

function now() {
  return new Date();
}

module.exports = { computeBackoff, now };
