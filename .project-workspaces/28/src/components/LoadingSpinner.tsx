import { motion } from 'framer-motion';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  text?: string;
  colorScheme?: 'brand' | 'emerald' | 'gold';
}

const sizeMap = {
  sm: { circle: 32, glow: 70 },
  md: { circle: 56, glow: 120 },
  lg: { circle: 80, glow: 170 },
};

const colorSchemes = {
  brand: {
    gradient: 'linear-gradient(135deg, hsl(217 91% 60%) 0%, hsl(258 90% 66%) 40%, hsl(271 81% 56%) 60%, hsl(330 81% 60%) 100%)',
    glow: 'hsla(271, 81%, 56%, 0.4)',
    blur: 'radial-gradient(circle, hsla(271,81%,56%,0.5) 0%, hsla(330,81%,60%,0.3) 50%, transparent 70%)',
  },
  emerald: {
    gradient: 'linear-gradient(135deg, hsl(217 91% 60%) 0%, hsl(160 84% 39%) 40%, hsl(174 72% 56%) 60%, hsl(189 94% 43%) 100%)',
    glow: 'hsla(160, 84%, 39%, 0.4)',
    blur: 'radial-gradient(circle, hsla(160,84%,39%,0.5) 0%, hsla(174,72%,56%,0.3) 50%, transparent 70%)',
  },
  gold: {
    gradient: 'linear-gradient(135deg, hsl(43 96% 56%) 0%, hsl(36 100% 50%) 40%, hsl(45 93% 47%) 60%, hsl(0 0% 95%) 100%)',
    glow: 'hsla(43, 96%, 56%, 0.5)',
    blur: 'radial-gradient(circle, hsla(43,96%,56%,0.5) 0%, hsla(0,0%,100%,0.25) 50%, transparent 70%)',
  },
};

export function LoadingSpinner({ size = 'lg', className, text, colorScheme = 'gold' }: LoadingSpinnerProps) {
  const config = sizeMap[size];
  const colors = colorSchemes[colorScheme];
  const circleCount = 5;

  return (
    <div className={`flex flex-col items-center justify-center gap-3 ${className || ''}`}>
      <div
        className="relative flex items-center justify-center"
        style={{ width: config.glow, height: config.glow }}
        role="status"
        aria-label="Loading"
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <motion.div
            key={`blur-${i}`}
            className="absolute rounded-full blur-xl"
            style={{ width: config.circle * 0.8, height: config.circle * 0.8, background: colors.blur }}
            animate={{ scale: [0.3, 1.5, 2], opacity: [0, 0.5, 0] }}
            transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.3, ease: [0.4, 0, 0.2, 1] }}
          />
        ))}
        {Array.from({ length: circleCount }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{ width: config.circle, height: config.circle, background: colors.gradient, boxShadow: `0 0 30px ${colors.glow}` }}
            animate={{ scale: [0.2, 0.7, 1, 1, 1.1, 1.3], opacity: [0, 0.7, 1, 1, 0.7, 0], rotate: [0, 90, 180, 270, 320, 360] }}
            transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.3, ease: "easeOut", times: [0, 0.25, 0.35, 0.65, 0.75, 1] }}
          />
        ))}
      </div>
      {text && <p className="text-sm text-muted-foreground">{text}</p>}
    </div>
  );
}

export default LoadingSpinner;
