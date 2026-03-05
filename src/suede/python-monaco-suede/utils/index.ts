export const join = (...parts: string[]) =>
  parts
    .map((part, index, { length }) =>
      index === 0
        ? part.replace(/\/+$/, "")
        : index === length - 1
          ? part.replace(/^\/+/, "")
          : part.replace(/^\/+|\/+$/g, ""),
    )
    .filter(Boolean)
    .join("/");

export const singletonify = <T extends Record<string, () => any>>(
  getters: T,
): { [K in keyof T]: ReturnType<T[K]> } => {
  const instances = new Map<string, ReturnType<T[keyof T]>>();
  let self: { [K in keyof T]: ReturnType<T[K]> };
  self = new Proxy<typeof self>({} as typeof self, {
    get(target, key: string) {
      if (!instances.has(key)) instances.set(key, getters[key]());
      return instances.get(key);
    },
  });
  return self;
};
