export async function loadWithinDeadline(load, label, timeoutMs, signal) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError('Request timeout must be a positive finite number.');
  }
  const controller = new AbortController();
  let timer;
  let onAbort;
  const unavailable = new Promise((resolve, reject) => {
    const stop = (reason) => {
      reject(reason);
      controller.abort(reason);
    };
    onAbort = () => stop(signal.reason || new Error('Request was cancelled.'));
    if (signal?.aborted) {
      onAbort();
    } else {
      signal?.addEventListener('abort', onAbort, { once: true });
      timer = setTimeout(() => stop(new Error(`${label} timed out. Please try again.`)), timeoutMs);
    }
  });
  try {
    return await Promise.race([
      unavailable,
      Promise.resolve().then(() => {
        controller.signal.throwIfAborted();
        return load(controller.signal);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
