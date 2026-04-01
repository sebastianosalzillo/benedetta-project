const MAX_CONSECUTIVE_FAILURES = 3;

function createDefaultCircuitBreakerState() {
  return {
    consecutiveFailures: 0,
    lastFailureAt: null,
    lastFailureReason: '',
    isTripped: false,
    trippedAt: null,
    totalFailures: 0,
    totalSuccesses: 0,
    lastSuccessAt: null,
  };
}

function recordSuccess(state) {
  state.consecutiveFailures = 0;
  state.totalSuccesses += 1;
  state.lastSuccessAt = new Date().toISOString();

  if (state.isTripped) {
    state.isTripped = false;
    state.trippedAt = null;
    return { ok: true, message: 'Circuit breaker resettato. ACP operativo.' };
  }

  return { ok: true, message: null };
}

function recordFailure(state, reason = '') {
  state.consecutiveFailures += 1;
  state.totalFailures += 1;
  state.lastFailureAt = new Date().toISOString();
  state.lastFailureReason = String(reason || '').slice(0, 500);

  if (state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    state.isTripped = true;
    state.trippedAt = new Date().toISOString();
    return {
      ok: false,
      tripped: true,
      message: `ACP non risponde dopo ${state.consecutiveFailures} tentativi consecutivi. Circuit breaker attivato.`,
      suggestion: 'Prova a resettare la sessione con /reset o verifica che Qwen Code CLI sia installato.',
    };
  }

  return {
    ok: false,
    tripped: false,
    message: `Fallimento ACP ${state.consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}.`,
  };
}

function resetCircuitBreaker(state) {
  state.consecutiveFailures = 0;
  state.isTripped = false;
  state.trippedAt = null;
  state.lastFailureAt = null;
  state.lastFailureReason = '';
  return { ok: true, message: 'Circuit breaker resettato manualmente.' };
}

function getCircuitBreakerStatus(state) {
  return {
    isTripped: state.isTripped,
    consecutiveFailures: state.consecutiveFailures,
    maxFailures: MAX_CONSECUTIVE_FAILURES,
    totalFailures: state.totalFailures,
    totalSuccesses: state.totalSuccesses,
    lastFailureAt: state.lastFailureAt,
    lastFailureReason: state.lastFailureReason,
    lastSuccessAt: state.lastSuccessAt,
    trippedAt: state.trippedAt,
    successRate: (state.totalFailures + state.totalSuccesses) > 0
      ? Math.round((state.totalSuccesses / (state.totalFailures + state.totalSuccesses)) * 100)
      : 100,
  };
}

function canExecute(state) {
  return !state.isTripped;
}

module.exports = {
  createDefaultCircuitBreakerState,
  recordSuccess,
  recordFailure,
  resetCircuitBreaker,
  getCircuitBreakerStatus,
  canExecute,
  MAX_CONSECUTIVE_FAILURES,
};
