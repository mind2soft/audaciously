import { createEmitter, type Emitter } from "../emitter";
import type {
  AudioSequence,
  BufferedAudioSequence,
  BufferedAudioSequenceType,
} from "./sequence";

export type ToolsOptions = {
  tools: AudioTool[];
  defaultToolKey?: string;
};

interface ToolsEvent<EventType extends string> {
  type: EventType;
}

type ToolsEventMap = {
  change: (event: ToolsEvent<"change">) => void;
};

export interface Tools extends Emitter<ToolsEventMap> {
  registerSequence<Kind>(
    sequence: BufferedAudioSequence<Kind>,
    target: HTMLElement,
  ): void;
  unregisterSequence<Kind>(sequence: BufferedAudioSequence<Kind>): void;
  selectTool(toolKey: string): void;
  getSelected(): AudioTool;
}

export interface AudioTool {
  readonly key: string;

  registerHandlers<Kind>(
    sequence: AudioSequence<Kind, BufferedAudioSequenceType>,
    target: HTMLElement,
  ): void;
  unregisterHandlers(): void;
}

export function createTools(options: ToolsOptions) {
  if (options.tools.length === 0) {
    throw new Error("no tools provided");
  }

  const sequences = new Map<BufferedAudioSequence<any>, HTMLElement>();
  const toolmap = new Map<string, AudioTool>(
    options.tools.map((tool) => [tool.key, tool]),
  );
  let selectedKey: string = options.defaultToolKey ?? options.tools[0].key;

  if (!toolmap.has(selectedKey)) {
    throw new Error(`invalid default tool : ${selectedKey}`);
  }

  function bindSequenceHandlers<Kind>(
    sequence: BufferedAudioSequence<Kind>,
    target: HTMLElement,
  ) {
    toolmap.get(selectedKey)?.registerHandlers(sequence, target);
  }

  const { dispatchEvent, ...emitter } = createEmitter<ToolsEventMap>(
    (event) => event,
  );

  const tools: Tools = {
    registerSequence(sequence, target): void {
      sequences.set(sequence, target);

      bindSequenceHandlers(sequence, target);
    },

    unregisterSequence(sequence): void {
      if (selectedKey) {
        toolmap.get(selectedKey)?.unregisterHandlers();
      }

      sequences.delete(sequence);

      sequences.forEach((target, sequence) => {
        bindSequenceHandlers(sequence, target);
      });
    },

    selectTool(key): void {
      if (selectedKey) {
        toolmap.get(selectedKey)?.unregisterHandlers();
      }

      selectedKey = key;

      sequences.forEach((target, sequence) => {
        bindSequenceHandlers(sequence, target);
      });

      dispatchEvent({ type: "change" });
    },

    getSelected(): AudioTool {
      if (!selectedKey) {
        throw new Error("no tool selected");
      }

      const tool = toolmap.get(selectedKey);

      if (!tool) {
        console.error("Invalid tool", selectedKey);
        throw new Error("invalid tool selection");
      }

      return tool;
    },

    ...emitter,
  };

  return tools;
}
