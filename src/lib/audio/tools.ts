import type { AudioSequence } from "./sequence";

export type ToolsOptions = {
  tools: AudioTool[];
  selectedTool: Symbol;
};

export interface Tools {
  registerSequence(sequence: AudioSequence<any>, target: HTMLElement): void;
  unregisterSequence(sequence: AudioSequence<any>): void;
  selectTool(key: Symbol): void;
  getSelected(): AudioTool;
}

export interface AudioTool {
  readonly key: Symbol;

  registerHandlers(sequence: AudioSequence<any>, target: HTMLElement): void;
  unregisterHandlers(): void;
}

export function createTools(options: ToolsOptions) {
  const sequences = new Map<AudioSequence<any>, HTMLElement>();
  const toolmap = new Map<Symbol, AudioTool>(
    options.tools.map((tool) => [tool.key, tool])
  );
  let selectedKey: Symbol = options.selectedTool;

  function bindSequenceHandlers(
    sequence: AudioSequence<any>,
    target: HTMLElement
  ) {
    toolmap.get(selectedKey)?.registerHandlers(sequence, target);
  }

  const tools: Tools = {
    // ...

    registerSequence(sequence, target): void {
      sequences.set(sequence, target);

      bindSequenceHandlers(sequence, target);
    },

    unregisterSequence(sequence): void {
      sequences.delete(sequence);
    },

    // ...)

    selectTool(key): void {
      if (selectedKey) {
        toolmap.get(selectedKey)?.unregisterHandlers();
      }

      sequences.forEach((target, sequence) => {
        bindSequenceHandlers(sequence, target);
      });

      selectedKey = key;
    },

    getSelected(): AudioTool {
      if (!selectedKey) {
        throw new Error("no tool selected");
      }

      const tool = toolmap.get(selectedKey);

      if (!tool) {
        throw new Error("invalid tool selection");
      }

      return tool;
    },
  };

  return tools;
}
