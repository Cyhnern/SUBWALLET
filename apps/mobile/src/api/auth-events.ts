type Listener = () => void;
const listeners: Set<Listener> = new Set();

export const authEvents = {
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  emitSessionExpired() {
    listeners.forEach((listener) => listener());
  },
};
