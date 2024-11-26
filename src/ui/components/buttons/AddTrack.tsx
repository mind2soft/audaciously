import type { JSX } from "solid-js/jsx-runtime";

export interface AddTrackButtonProps
  extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {}

function AddTrackButton({ class: className, ...props }: AddTrackButtonProps) {
  return (
    <button class={`text-base btn ${className}`} {...props}>
      <span class="iconify mdi--add size-7"></span>
    </button>
  );
}

export default AddTrackButton;
