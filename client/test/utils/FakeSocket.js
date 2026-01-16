export class FakeSocket {
  constructor() {
    this.listeners = new Map();
    this.emits = [];
    this.connected = true;
  }

  on(event, fn) {
    if (!event || typeof fn !== 'function') return;
    const list = this.listeners.get(event) || [];
    list.push(fn);
    this.listeners.set(event, list);
  }

  off(event, fn) {
    if (!event) {
      this.listeners.clear();
      return;
    }
    const list = this.listeners.get(event);
    if (!list || !fn) {
      this.listeners.delete(event);
      return;
    }
    this.listeners.set(
      event,
      list.filter((listener) => listener !== fn),
    );
  }

  emit(event, payload, ack) {
    this.emits.push({ event, payload });
    if (typeof ack === 'function') {
      ack({ ok: true });
    }
  }

  serverEmit(event, payload) {
    const handlers = this.listeners.get(event);
    if (!handlers) return;
    handlers.forEach((fn) => fn(payload));
  }

  reset() {
    this.listeners.clear();
    this.emits = [];
  }

  disconnect() {
    this.connected = false;
  }
}
