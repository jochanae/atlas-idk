import { useEffect, useRef, type ReactNode } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
};

/**
 * Glassmorphic bottom sheet for mobile — slides up with backdrop blur.
 */
export function BottomSheet({ open, onClose, children }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (sheetRef.current && !sheetRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Small delay so the opening tap doesn't immediately close
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handler);
      document.addEventListener("touchstart", handler);
    }, 60);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        background: "rgba(0, 0, 0, 0.5)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        animation: "atlas-bs-backdrop-in 200ms ease forwards",
      }}
    >
      <div
        ref={sheetRef}
        style={{
          background: "rgba(18, 18, 18, 0.92)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderRadius: "24px 24px 0 0",
          border: "1px solid rgba(212, 175, 55, 0.15)",
          borderBottom: "none",
          padding: "12px 16px 34px",
          boxShadow: "0 -12px 48px rgba(0,0,0,0.5)",
          animation: "atlas-bs-slide-up 260ms cubic-bezier(0.22, 1, 0.36, 1) forwards",
        }}
      >
        {/* Drag handle */}
        <div
          style={{
            width: 36,
            height: 4,
            borderRadius: 2,
            background: "rgba(255,255,255,0.15)",
            margin: "0 auto 16px",
          }}
        />
        {children}
      </div>
    </div>
  );
}
