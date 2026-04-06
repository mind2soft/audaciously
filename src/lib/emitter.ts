type BaseEventArg<Type> = { type: Type };

type EventArgType<Event> = Event extends (event: infer U extends BaseEventArg<string>) => unknown
  ? U["type"]
  : never;

type EventArg<Event> = Event extends (event: infer U extends BaseEventArg<string>) => unknown
  ? U
  : never;

type EventArgDispatch<Event> = { type: EventArgType<Event> } & Partial<
  Omit<EventArg<Event>, "type">
>;

type EventType<EventMap> = Extract<keyof EventMap, string>;

export type EventHandlers<EventMap> = {
  [K in Extract<keyof EventMap, string>]: EventMap[K] extends (event: infer U) => unknown
    ? U extends BaseEventArg<K>
      ? EventMap[K]
      : never
    : never;
};

type EventCreator<EventMap> = <Type extends EventType<EventMap>>(
  event: EventArg<EventMap[Type]>,
) => EventArg<EventMap[Type]>;

// biome-ignore lint/complexity/noBannedTypes: {} is the correct constraint here — Record<string, never> resolves all values to never
export interface Emitter<EventMap extends EventHandlers<{}>> {
  addEventListener<Type extends EventType<EventMap>>(type: Type, callback: EventMap[Type]): void;
  removeEventListener<Type extends EventType<EventMap>>(type: Type, callback: EventMap[Type]): void;
}

// biome-ignore lint/complexity/noBannedTypes: {} is the correct constraint here — Record<string, never> resolves all values to never
export interface EmitterDispatcher<EventMap extends EventHandlers<{}>> extends Emitter<EventMap> {
  dispatchEvent<Type extends Extract<keyof EventMap, string>>(
    event: EventArgDispatch<EventMap[Type]>,
  ): void;
}

// biome-ignore lint/complexity/noBannedTypes: {} is the correct constraint here — Record<string, never> resolves all values to never
function createEmitter<EventMap extends EventHandlers<{}>>(
  createEvent: EventCreator<EventMap>,
): EmitterDispatcher<EventMap> {
  // biome-ignore lint/suspicious/noExplicitAny: listeners map stores heterogeneous callback types per event key — can't be typed further
  const listeners: Map<string, Set<any>> = new Map();

  return {
    dispatchEvent(event) {
      // biome-ignore lint/suspicious/noExplicitAny: internal dispatch coercion — union event types can't be narrowed further here
      event = createEvent(event as any) as unknown as typeof event;
      for (const callback of listeners.get(event.type) ?? []) callback(event);
    },
    addEventListener(type, callback) {
      if (!listeners.has(type)) {
        listeners.set(type, new Set());
      }

      listeners.get(type)?.add(callback);
    },
    removeEventListener(type, callback) {
      const callbacks = listeners.get(type);

      if (callbacks?.size) {
        callbacks.delete(callback);

        if (!callbacks.size) {
          listeners.delete(type);
        }
      }
    },
  };
}

export { createEmitter };
