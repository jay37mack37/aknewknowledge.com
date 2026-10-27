/**
 * Swipe gestures for the maze. Movement is relative to where Pac-Man faces:
 * swipe left/right = turn left/right at the next opening, swipe up = keep going,
 * swipe down = turn around. A short swipe (>= 24 px) is enough; the turn fires once
 * per gesture, as soon as the finger has moved far enough (no waiting for the lift).
 */
export function classifySwipe(dx, dy, minDistance = 24) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (Math.max(ax, ay) < minDistance) return null;
  if (ax > ay * 1.15) return dx < 0 ? 'LEFT' : 'RIGHT';
  if (ay > ax * 1.15) return dy < 0 ? 'FORWARD' : 'BACK';
  return null; // ambiguous diagonal
}

export function attachSwipe(target, onTurn, options = {}) {
  const minDistance = options.minDistance || 24;
  const touches = new Map(); // pointerId -> { x, y, fired }

  const isControl = (el) => !!(el && el.closest && el.closest('button, a, input, label, [data-no-swipe]'));

  function start(e) {
    if (e.pointerType === 'mouse' || isControl(e.target)) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY, fired: false });
  }

  function move(e) {
    const t = touches.get(e.pointerId);
    if (!t) return;
    e.preventDefault();
    if (t.fired) return; // one swipe = one turn, however long the drag
    const turn = classifySwipe(e.clientX - t.x, e.clientY - t.y, minDistance);
    if (turn) {
      t.fired = true;
      onTurn(turn);
    }
  }

  function end(e) {
    touches.delete(e.pointerId);
  }

  target.addEventListener('pointerdown', start, { passive: true });
  window.addEventListener('pointermove', move, { passive: false });
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
  // iOS Safari: stop the page from scrolling/zooming under a swipe.
  target.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  return () => {
    target.removeEventListener('pointerdown', start);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
  };
}
