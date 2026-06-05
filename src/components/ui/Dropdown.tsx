import { ReactNode, useEffect, useRef, useState } from "react";

type RenderApi = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  containerRef: React.RefObject<HTMLDivElement>;
};

type Props = {
  children: (api: RenderApi) => ReactNode;
  closeOnEscape?: boolean;
};

export default function Dropdown({ children, closeOnEscape = true }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setIsOpen(false);
    }

    function onKey(e: KeyboardEvent) {
      if (!closeOnEscape) return;
      if (e.key === "Escape") setIsOpen(false);
    }

    document.addEventListener("mousedown", onDocClick);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [closeOnEscape]);

  const api: RenderApi = {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    toggle: () => setIsOpen((v) => !v),
    containerRef,
  };

  return <div ref={containerRef}>{children(api)}</div>;
}
