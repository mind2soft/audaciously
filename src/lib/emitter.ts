type BaseEventArg<Type> = { type: Type };

type EventArgType<Event> = Event extends (
  event: infer U extends BaseEventArg<string>
) => any
  ? U["type"]
  : never;

type EventArg<Event> = Event extends (
  event: infer U extends BaseEventArg<string>
) => any
  ? U
  : never;

type EventArgDispatch<Event> = { type: EventArgType<Event> } & Partial<
  Omit<EventArg<Event>, "type">
>;

type EventType<EventMap> = Extract<keyof EventMap, string>;

export type EventHandlers<EventMap> = {
  [K in Extract<keyof EventMap, string>]: EventMap[K] extends (
    event: infer U
  ) => any
    ? U extends BaseEventArg<K>
      ? EventMap[K]
      : never
    : never;
};

type EventCreator<EventMap> = <Type extends EventType<EventMap>>(
  event: EventArg<EventMap[Type]>
) => EventArg<EventMap[Type]>;

export interface Emitter<EventMap extends EventHandlers<{}>> {
  addEventListener<Type extends EventType<EventMap>>(
    type: Type,
    callback: EventMap[Type]
  ): void;
  removeEventListener<Type extends EventType<EventMap>>(
    type: Type,
    callback: EventMap[Type]
  ): void;
}

export interface EmitterDispatcher<EventMap extends EventHandlers<{}>>
  extends Emitter<EventMap> {
  dispatchEvent<Type extends Extract<keyof EventMap, string>>(
    event: EventArgDispatch<EventMap[Type]>
  ): void;
}

function createEmitter<EventMap extends EventHandlers<{}>>(
  createEvent: EventCreator<EventMap>
): EmitterDispatcher<EventMap> {
  const listeners: Map<string, Set<any>> = new Map();

  return {
    dispatchEvent(event) {
      event = createEvent(event as any) as any;
      listeners.get(event.type)?.forEach((callback) => callback(event));
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
