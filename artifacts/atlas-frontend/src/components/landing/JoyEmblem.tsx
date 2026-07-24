/**
 * JoyEmblem — the illuminated "J" mark used in the app's center dock button.
 *
 * Shared across the landing surface so every CTA that "enters" a conversation
 * with Joy uses the exact same symbol the visitor will meet inside the product.
 * Same DNA as AxiomCenterSVG in UnifiedContextDock: obsidian disk, violet
 * radial glow, tapered gold "A/J" mark, gold outer glow ring on `glow`.
 */
import type { CSSProperties } from "react";

interface Props {
  size?: number;
  /** Adds a soft gold halo behind the disk (use for CTAs, not inline chips). */
  glow?: boolean;
  style?: CSSProperties;
}

export function JoyEmblem({ size = 44, glow = false, style }: Props) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: "50%",
        boxShadow: glow
          ? "0 0 24px 4px rgba(212,175,55,0.28), 0 0 60px 12px rgba(91,33,182,0.18)"
          : undefined,
        ...style,
      }}
    >
      <svg viewBox="0 0 512 512" width={size} height={size} display="block">
        <defs>
          <radialGradient id={`joyEmblemGlow-${size}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#5B21B6" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#0D0B09" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`joyEmblemGold-${size}`} cx="50%" cy="40%" r="50%">
            <stop offset="0%" stopColor="#F5D97A" />
            <stop offset="50%" stopColor="#D4AF37" />
            <stop offset="100%" stopColor="#A07820" />
          </radialGradient>
        </defs>
        <circle cx="256" cy="256" r="256" fill="#0D0B09" />
        <circle cx="256" cy="256" r="256" fill={`url(#joyEmblemGlow-${size})`} />
        <g transform="translate(197 307) scale(0.14 -0.14)">
          <path
            fill={`url(#joyEmblemGold-${size})`}
            d="M1153 160Q1111 171 1069.5 181.5Q1028 192 985 201Q934 97 877 -3Q820 -103 756 -200Q707 -274 646.5 -345Q586 -416 518.5 -478.5Q451 -541 378.5 -593.5Q306 -646 232.5 -684.5Q159 -723 86.5 -744Q14 -765 -54 -765Q-115 -765 -177 -743.5Q-239 -722 -288.5 -679Q-338 -636 -369 -571.5Q-400 -507 -400 -420Q-400 -375 -389.5 -325Q-379 -275 -355 -222Q-331 -169 -293 -113.5Q-255 -58 -200 0Q-127 77 -36.5 133Q54 189 156 225.5Q258 262 369 279.5Q480 297 594 297Q669 297 743.5 290Q818 283 893 270Q946 380 989 489Q1032 598 1064 704Q1112 866 1133 985Q1154 1104 1154 1191Q1154 1265 1142 1318.5Q1130 1372 1111 1409.5Q1092 1447 1067 1470.5Q1042 1494 1016.5 1506.5Q991 1519 966.5 1523.5Q942 1528 923 1528Q843 1528 780 1490Q717 1452 673.5 1383Q630 1314 607 1216.5Q584 1119 584 1000Q584 907 600 828Q616 749 640 684Q664 619 692.5 569Q721 519 745.5 485Q770 451 786 433Q802 415 803 415L772 383Q708 438 652 505Q596 572 555 649Q514 726 490 812.5Q466 899 466 997Q466 1105 492.5 1206.5Q519 1308 571 1385.5Q623 1463 702 1509Q781 1555 887 1555Q954 1555 1017 1536Q1080 1517 1129 1472.5Q1178 1428 1207.5 1354.5Q1237 1281 1237 1175Q1237 1086 1215.5 973.5Q1194 861 1146 704Q1113 594 1073 491Q1033 388 985 285Q1027 274 1071.5 263.5Q1116 253 1165 244L1153 160ZM594 241Q476 241 374.5 219Q273 197 189 158Q105 119 39.5 64Q-26 9 -73 -56Q-119 -119 -142.5 -182Q-166 -245 -166 -305Q-166 -362 -147.5 -408.5Q-129 -455 -97 -488.5Q-65 -522 -22 -540Q21 -558 70 -558Q147 -558 230.5 -519Q314 -480 396.5 -409.5Q479 -339 556.5 -240Q634 -141 697 -20Q745 71 793 163Q721 202 594 241Z"
          />
        </g>
      </svg>
    </span>
  );
}
