type EventCreator<EventType, Event extends { type: EventType }> = (
  event: Event
) => Event;

export type EventHandler<
  EventType extends string,
  EventArg extends { type: EventType } = any
> = {
  [K in EventType]: (event: EventArg) => void;
};

export interface Emitter<
  EventType extends string,
  EventMap extends EventHandler<EventType>
> {
  addEventListener<Type extends keyof EventMap>(
    type: Type,
    callback: EventMap[Type]
  ): void;
  removeEventListener<Type extends keyof EventMap>(
    type: Type,
    callback: EventMap[Type]
  ): void;
}

export interface EmitterDispatcher<
  EventType extends string,
  EventMap extends EventHandler<EventType>,
  Event extends { type: EventType }
> extends Emitter<EventType, EventMap> {
  dispatchEvent<
    EventArg extends { type: keyof EventMap } & Partial<Omit<Event, "type">>
  >(
    event: EventArg
  ): void;
}

function createEmitter<
  EventType extends string,
  EventMap extends EventHandler<EventType>,
  Event extends { type: EventType }
>(
  createEvent: EventCreator<keyof EventMap, Event>
): EmitterDispatcher<EventType, EventMap, Event> {
  const listeners: Map<keyof EventMap, Set<Function>> = new Map();

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
