import { forwardRef, type InputHTMLAttributes } from "react";

type CyberInputSize = "default" | "micro";

interface CyberInputProps extends InputHTMLAttributes<HTMLInputElement> {
  sizeVariant?: CyberInputSize;
}

const heightMap: Record<CyberInputSize, string> = {
  default: "h-9",
  micro: "h-6",
};

const textMap: Record<CyberInputSize, string> = {
  default: "text-xs",
  micro: "text-micro",
};

export const CyberInput = forwardRef<HTMLInputElement, CyberInputProps>(
  ({ className = "", sizeVariant = "default", ...props }, ref) => {
    const h = heightMap[sizeVariant];
    const t = textMap[sizeVariant];
    return (
      <input
        ref={ref}
        className={`
          w-full ${h} px-3 rounded-lg
          bg-[var(--bg-field)] text-[var(--text-primary)]
          border border-[var(--border-field)] ${t}
          placeholder:text-[rgba(255,255,255,0.2)]
          outline-none transition-[border-color,box-shadow] duration-150 ease-out
          focus:border-[var(--accent-cyan)] focus:shadow-[0_0_0_2px_rgba(0,229,255,0.15)]
          disabled:opacity-40 disabled:cursor-not-allowed
          ${className}
        `.trim()}
        {...props}
      />
    );
  }
);

CyberInput.displayName = "CyberInput";
