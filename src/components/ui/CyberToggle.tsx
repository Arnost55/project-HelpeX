import { forwardRef, type InputHTMLAttributes } from "react";

interface CyberToggleProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
  sizeVariant?: "default" | "micro";
}

const trackMap = {
  default: "w-10 h-6",
  micro: "w-7 h-[18px]",
};

const thumbMap = {
  default: "w-[18px] h-[18px] top-[3px] left-[3px]",
  micro: "w-3 h-3 top-[3px] left-[3px]",
};

const translateMap = {
  default: "translate-x-4",
  micro: "translate-x-[13px]",
};

export const CyberToggle = forwardRef<HTMLInputElement, CyberToggleProps>(
  ({ className = "", sizeVariant = "default", label, ...props }, ref) => {
    const track = trackMap[sizeVariant];
    const thumb = thumbMap[sizeVariant];
    const tx = translateMap[sizeVariant];
    return (
      <label className={`inline-flex items-center gap-2 cursor-pointer ${className}`}>
        <input ref={ref} type="checkbox" className="hidden" {...props} />
        <div
          className={`${track} rounded-full relative transition-colors duration-150 ease-out ${
            props.checked ? "bg-[var(--accent-cyan)]" : "bg-[rgba(255,255,255,0.08)]"
          }`}
        >
          <div
            className={`${thumb} absolute rounded-full bg-white transition-transform duration-150 ease-out ${
              props.checked ? tx : "translate-x-0"
            }`}
          />
        </div>
        {label && (
          <span className="text-xs text-[var(--text-primary)] select-none">{label}</span>
        )}
      </label>
    );
  }
);

CyberToggle.displayName = "CyberToggle";
