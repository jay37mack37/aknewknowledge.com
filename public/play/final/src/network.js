/**
 * Lightweight browser-compatible WebSocket client helper for Pac-Man multiplayer.
 * Works with native browser WebSocket or injected WebSocket implementation.
 */
export function createNetworkClient(options = {}) {
  const WebSocketImpl = options.WebSocketImpl || globalThis.WebSocket;
  if (!WebSocketImpl) {
    throw new Error('WebSocket implementation not found');
  }

  let ws = null;
  let connectionGeneration = 0;
  const listeners = new Map();

  function on(event, handler) {
    if (!listeners.has(event)) {
      listeners.set(event, new Set());
    }
    listeners.get(event).add(handler);
    return () => off(event, handler);
  }

  function off(event, handler) {
    const set = listeners.get(event);
    if (set) {
      set.delete(handler);
    }
  }

  function removeAllListeners(event) {
    if (event) {
      listeners.delete(event);
    } else {
      listeners.clear();
    }
  }

  function getListenerCounts() {
    const counts = {};
    for (const [evt, set] of listeners.entries()) {
      counts[evt] = set.size;
    }
    return counts;
  }

  function emit(event, data) {
    const set = listeners.get(event);
    if (set) {
      for (const handler of set) {
        try {
          handler(data);
        } catch (err) {
          // Log error AND rethrow asynchronously to surface to window.onerror/pageerror
          console.error(`Error in network event handler for ${event}:`, err);
          if (typeof queueMicrotask === 'function') {
            queueMicrotask(() => { throw err; });
          } else {
            setTimeout(() => { throw err; }, 0);
          }
        }
      }
    }
  }

  function connect(url, connectOpts = {}) {
    if (ws && (ws.readyState === WebSocketImpl.CONNECTING || ws.readyState === WebSocketImpl.OPEN)) {
      return Promise.reject(new Error('Already connected or connecting'));
    }

    const timeoutMs = typeof connectOpts.timeoutMs === 'number' ? connectOpts.timeoutMs : 5000;
    const currentGen = ++connectionGeneration;

    return new Promise((resolve, reject) => {
      try {
        ws = new WebSocketImpl(url);
      } catch (err) {
        return reject(err);
      }

      let settled = false;
      let timer = null;

      const cleanupTimer = () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      };

      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          if (currentGen !== connectionGeneration) return;
          if (!settled) {
            settled = true;
            const err = new Error(`Connection timeout after ${timeoutMs}ms`);
            disconnect();
            emit('error', err);
            reject(err);
          }
        }, timeoutMs);
      }

      const onOpen = () => {
        if (currentGen !== connectionGeneration) return;
        cleanupTimer();
        if (!settled) {
          settled = true;
          emit('open');
          resolve();
        }
      };

      const onError = (err) => {
        if (currentGen !== connectionGeneration) return;
        cleanupTimer();
        emit('error', err);
        if (!settled) {
          settled = true;
          disconnect();
          reject(err);
        }
      };

      const onClose = (event) => {
        if (currentGen !== connectionGeneration) return;
        cleanupTimer();
        emit('close', event);
        if (!settled) {
          settled = true;
          disconnect();
          const code = event && event.code ? ` (code: ${event.code})` : '';
          reject(new Error(`WebSocket closed before connection was established${code}`));
        }
      };

      const onMessage = (event) => {
        if (currentGen !== connectionGeneration) return;
        try {
          const raw = typeof event.data === 'string' ? event.data : event.data.toString();
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed.type === 'string') {
            emit(parsed.type, parsed);
          }
          emit('message', parsed);
        } catch (err) {
          emit('error', err);
        }
      };

      if (typeof ws.addEventListener === 'function') {
        ws.addEventListener('open', onOpen);
        ws.addEventListener('error', onError);
        ws.addEventListener('close', onClose);
        ws.addEventListener('message', onMessage);
      } else {
        ws.onopen = onOpen;
        ws.onerror = onError;
        ws.onclose = onClose;
        ws.onmessage = onMessage;
      }
    });
  }

  function send(data) {
    if (!ws || ws.readyState !== WebSocketImpl.OPEN) {
      return false;
    }
    ws.send(typeof data === 'string' ? data : JSON.stringify(data));
    return true;
  }

  function join(roomId, name) {
    return send({ type: 'join', roomId, name });
  }

  function leave() {
    return send({ type: 'leave' });
  }

  function disconnect() {
    connectionGeneration++;
    if (ws) {
      try {
        // Strip listeners to avoid unexpected teardown events firing on dead socket
        ws.onopen = null;
        ws.onerror = null;
        ws.onclose = null;
        ws.onmessage = null;
        if (typeof ws.terminate === 'function') {
          ws.terminate();
        } else {
          ws.close();
        }
      } catch (e) {
        // Ignore errors on socket teardown
      }
      ws = null;
    }
  }

  function getReadyState() {
    return ws ? ws.readyState : -1;
  }

  return {
    connect,
    join,
    leave,
    send,
    disconnect,
    on,
    off,
    emit,
    removeAllListeners,
    getListenerCounts,
    getReadyState
  };
}
