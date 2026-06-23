import { ReactNode, useRef, useEffect, useState, useCallback } from "react";

interface ScaledSlideProps {
  children: ReactNode;
  className?: string;
}

const SLIDE_W = 1920;
const SLIDE_H = 1080;

export default function ScaledSlide({ children, className = "" }: ScaledSlideProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  const updateScale = useCallback(() => {
    if (!containerRef.current) return;
    const { width, height } = containerRef.current.getBoundingClientRect();
    setScale(Math.min(width / SLIDE_W, height / SLIDE_H));
  }, []);

  useEffect(() => {
    updateScale();
    const obs = new ResizeObserver(updateScale);
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [updateScale]);

  return (
    <div ref={containerRef} className={`relative w-full h-full overflow-hidden ${className}`}>
      <div
        className="absolute slide-content overflow-hidden"
        style={{
          width: SLIDE_W,
          height: SLIDE_H,
          left: "50%",
          top: "50%",
          marginLeft: -(SLIDE_W / 2),
          marginTop: -(SLIDE_H / 2),
          transform: `scale(${scale})`,
          transformOrigin: "center center",
          pointerEvents: "auto",
        }}
      >
        {children}
      </div>
    </div>
  );
}
