import type { JSX } from "solid-js/jsx-runtime";

export interface PlayButtonProps
  extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {}

function PlayButton({ class: className, ...props }: PlayButtonProps) {
  return (
    <button class={`text-green-500 btn ${className}`} {...props}>
      <span class="iconify mdi--play size-7"></span>
    </button>
  );
}

export default PlayButton;
