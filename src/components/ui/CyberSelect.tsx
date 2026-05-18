import { forwardRef, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";

interface CyberSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  sizeVariant?: "default" | "micro";
}

const heightMap = {
  default: "h-9",
  micro: "h-6",
};

const textMap = {
  default: "text-xs",
  micro: "text-micro",
};

export const CyberSelect = forwardRef<HTMLSelectElement, CyberSelectProps>(
  ({ className = "", sizeVariant = "default", children, ...props }, ref) => {
    const h = heightMap[sizeVariant];
    const t = textMap[sizeVariant];
    return (
      <div className="relative">
        <select
          ref={ref}
          className={`
            w-full ${h} pl-3 pr-8 rounded-lg
            bg-[var(--bg-field)] text-[var(--text-primary)]
            border border-[var(--border-field)] ${t} font-medium
            appearance-none cursor-pointer
            outline-none transition-[border-color] duration-150 ease-out
            focus:border-[var(--border-focus)]
            disabled:opacity-40 disabled:cursor-not-allowed
            ${className}
          `.trim()}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          size={14}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: "rgba(255,255,255,0.35)" }}
        />
      </div>
    );
  }
);

CyberSelect.displayName = "CyberSelect";
