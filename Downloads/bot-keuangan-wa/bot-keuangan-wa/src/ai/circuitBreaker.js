'use strict';

const { env } = require('../config/env');
const logger = require('../utils/logger');

/**
 * Circuit breaker sederhana per provider (F-3.2).
 * State: closed (normal) -> open (cooldown, request diblok) -> closed lagi
 * setelah waktu cooldown lewat.
 */
class CircuitBreaker {
  constructor(name) {
    this.name = name;
    this.openUntil = 0;
    this.lastReason = null;
    this.failCount = 0;
  }

  isOpen() {
    return Date.now() < this.openUntil;
  }

  cooldownRemainingMs() {
    return Math.max(0, this.openUntil - Date.now());
  }

  /** Buka circuit berdasarkan jenis error (quota habis vs rate-limit sesaat). */
  trip(errorType) {
    const minutes =
      errorType === 'quota' ? env.AI_QUOTA_COOLDOWN_MINUTES : env.AI_RATE_LIMIT_COOLDOWN_MINUTES;
    this.openUntil = Date.now() + minutes * 60_000;
    this.lastReason = errorType;
    this.failCount += 1;
    logger.warn({ provider: this.name, errorType, minutes }, 'AI provider cooldown diaktifkan');
  }

  reset() {
    this.openUntil = 0;
    this.lastReason = null;
    this.failCount = 0;
  }

  status() {
    return {
      provider: this.name,
      open: this.isOpen(),
      reason: this.lastReason,
      cooldownRemainingSeconds: Math.ceil(this.cooldownRemainingMs() / 1000),
      failCount: this.failCount,
    };
  }
}

/** Klasifikasi error HTTP/SDK menjadi 'quota' | 'rate_limit' | 'other'. */
function classifyError(err) {
  const status = err?.status || err?.response?.status;
  const message = String(err?.message || '').toLowerCase();
  if (status === 429 || message.includes('rate limit')) {
    if (message.includes('quota') || message.includes('billing')) return 'quota';
    return 'rate_limit';
  }
  if (status === 401 || status === 403) return 'auth';
  if (message.includes('quota')) return 'quota';
  return 'other';
}

module.exports = { CircuitBreaker, classifyError };
