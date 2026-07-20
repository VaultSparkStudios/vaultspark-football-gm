export function createSingleFlightCoordinator({ onStart = null, onFinish = null } = {}) {
  const active = new Map();
  return {
    run(key, task) {
      const normalizedKey = String(key || "default");
      if (active.has(normalizedKey)) return active.get(normalizedKey);
      const promise = Promise.resolve()
        .then(task)
        .finally(() => {
          active.delete(normalizedKey);
          onFinish?.(normalizedKey);
        });
      active.set(normalizedKey, promise);
      onStart?.(normalizedKey);
      return promise;
    },
    isActive(key) {
      return active.has(String(key || "default"));
    },
    activeKeys() {
      return [...active.keys()];
    }
  };
}

export const actionCoordinator = createSingleFlightCoordinator();
