import type { JSX } from "solid-js/jsx-runtime";

export interface RecordButtonProps
  extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {}

function RecordButton({ class: className, ...props }: RecordButtonProps) {
  return (
    <button class={`text-red-500 btn ${className}`} {...props}>
      <span class="iconify mdi--record size-7"></span>
    </button>
  );
}

export default RecordButton;
