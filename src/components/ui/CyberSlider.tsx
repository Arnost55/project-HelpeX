import { forwardRef, type InputHTMLAttributes } from "react";

interface CyberSliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  valueLabel?: string;
}

export const CyberSlider = forwardRef<HTMLInputElement, CyberSliderProps>(
  ({ className = "", valueLabel, ...props }, ref) => {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        <input
          ref={ref}
          type="range"
          className="
            flex-1 h-1 rounded-full appearance-none cursor-pointer
            bg-[rgba(255,255,255,0.08)]
            outline-none
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:w-3.5
            [&::-webkit-slider-thumb]:h-3.5
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-[var(--accent-glow)]
            [&::-webkit-slider-thumb]:border-2
            [&::-webkit-slider-thumb]:border-[rgba(255,255,255,0.2)]
            [&::-webkit-slider-thumb]:cursor-pointer
            [&::-webkit-slider-thumb]:transition-transform
            [&::-webkit-slider-thumb]:duration-150
            [&::-webkit-slider-thumb]:ease-out
            [&::-webkit-slider-thumb]:hover:scale-110
            [&::-moz-range-thumb]:w-3.5
            [&::-moz-range-thumb]:h-3.5
            [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:bg-[var(--accent-glow)]
            [&::-moz-range-thumb]:border-2
            [&::-moz-range-thumb]:border-[rgba(255,255,255,0.2)]
            [&::-moz-range-thumb]:cursor-pointer
          "
          {...props}
        />
        {valueLabel !== undefined && (
          <span className="token-readout w-12 text-right tabular-nums text-[var(--accent-cyan)]">
            {valueLabel}
          </span>
        )}
      </div>
    );
  }
);

CyberSlider.displayName = "CyberSlider";
