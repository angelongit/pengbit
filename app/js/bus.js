// Shared event bus. Features talk to the app and to each other only through this and ctx.js.
// Events (see the work-split doc): pet:hatched, pet:evolved, pet:hungry, pet:sad, pet:idle, pet:move,
// pet:minute {act, at}, model:changed {source, valAcc}, exercise:offer, exercise:done, nudge:predicted.
const handlers = new Map();   // type -> Set<fn>

export function on(type, fn) {
  if (!handlers.has(type)) handlers.set(type, new Set());
  handlers.get(type).add(fn);
  return () => off(type, fn);
}

export function off(type, fn) { handlers.get(type)?.delete(fn); }

// A throwing handler is logged and skipped so one feature can't break the others.
export function emit(type, payload) {
  for (const fn of [...(handlers.get(type) || [])]) {
    try { fn(payload, type); } catch (e) { console.error(`[bus] ${type} handler failed`, e); }
  }
  for (const fn of [...(handlers.get('*') || [])]) {
    try { fn(payload, type); } catch (e) { console.error('[bus] * handler failed', e); }
  }
}
