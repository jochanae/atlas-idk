/**
 * LOADING SPINNER - GRADIENT GLOW WITH RADIATING EFFECT
 * 
 * 5 overlapping circles with staggered bloom animation
 * Colors: Ember -> Accent Gold -> Phosphor (Atlas identity)
 * Animation: Scale up + rotate + fade out in sequence
 * 
 * Ported from CoinsBloom — adapted for Atlas color system.
 * Uses CSS animations instead of framer-motion for SSR compatibility.
 */

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  text?: string;
  colorScheme?: 'atlas' | 'ember' | 'phosphor';
}

const sizeMap = {
  sm: { circle: 32, glow: 70 },
  md: { circle: 56, glow: 120 },
  lg: { circle: 80, glow: 170 },
};

const colorSchemes = {
  atlas: {
    gradient: 'linear-gradient(135deg, #EA580C 0%, #C9A24C 45%, #06B6D4 100%)',
    glow: 'rgba(201,162,76,0.4)',
    blur: 'radial-gradient(circle, rgba(201,162,76,0.5) 0%, rgba(234,88,12,0.3) 50%, transparent 70%)',
  },
  ember: {
    gradient: 'linear-gradient(135deg, #EA580C 0%, #C9A24C 50%, #EA580C 100%)',
    glow: 'rgba(234,88,12,0.4)',
    blur: 'radial-gradient(circle, rgba(234,88,12,0.5) 0%, rgba(201,162,76,0.3) 50%, transparent 70%)',
  },
  phosphor: {
    gradient: 'linear-gradient(135deg, #06B6D4 0%, #0E7490 40%, #C9A24C 100%)',
    glow: 'rgba(6,182,212,0.4)',
    blur: 'radial-gradient(circle, rgba(6,182,212,0.5) 0%, rgba(14,116,144,0.3) 50%, transparent 70%)',
  },
};

export function LoadingSpinner({ size = 'lg', className, text, colorScheme = 'atlas' }: LoadingSpinnerProps) {
  const config = sizeMap[size];
  const colors = colorSchemes[colorScheme];
  const circleCount = 5;
  const staggerDelay = 0.3;

  return (
    <div className={`flex flex-col items-center justify-center gap-3 ${className || ''}`}>
      <div
        className="relative flex items-center justify-center"
        style={{ width: config.glow, height: config.glow }}
        role="status"
        aria-label="Loading"
      >
        {/* Blurred background orbs for smooth glow */}
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={`blur-${i}`}
            className="absolute rounded-full"
            style={{
              width: config.circle * 0.8,
              height: config.circle * 0.8,
              background: colors.blur,
              filter: 'blur(16px)',
              animation: `atlas-bloom-blur 2.5s ease-in-out ${i * staggerDelay}s infinite`,
            }}
          />
        ))}

        {/* 5 overlapping circles with staggered animations */}
        {Array.from({ length: circleCount }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              width: config.circle,
              height: config.circle,
              background: colors.gradient,
              boxShadow: `0 0 30px ${colors.glow}`,
              animation: `atlas-bloom-circle 2.5s ease-out ${i * staggerDelay}s infinite`,
            }}
          />
        ))}
      </div>
      {text && (
        <p
          className="font-mono text-[10px] uppercase tracking-[0.15em]"
          style={{ color: 'var(--muted-text)' }}
        >
          {text}
        </p>
      )}

      <style>{`
        @keyframes atlas-bloom-circle {
          0%   { transform: scale(0.2) rotate(0deg);   opacity: 0; }
          25%  { transform: scale(0.7) rotate(90deg);  opacity: 0.7; }
          35%  { transform: scale(1)   rotate(180deg); opacity: 1; }
          65%  { transform: scale(1)   rotate(270deg); opacity: 1; }
          75%  { transform: scale(1.1) rotate(320deg); opacity: 0.7; }
          100% { transform: scale(1.3) rotate(360deg); opacity: 0; }
        }
        @keyframes atlas-bloom-blur {
          0%   { transform: scale(0.3); opacity: 0; }
          50%  { transform: scale(1.5); opacity: 0.5; }
          100% { transform: scale(2);   opacity: 0; }
        }
      `}</style>
    </div>
  );
}

export default LoadingSpinner;
