import { Link } from "react-router-dom";
import pqLogo from "@/assets/logo-concept-pq-monogram.png";

interface PresentQLogoProps {
  size?: "xs" | "sm" | "md" | "lg";
  showText?: boolean;
  className?: string;
  linkTo?: string;
}

const imgSizeMap = {
  xs: "w-9 h-9",
  sm: "w-11 h-11",
  md: "w-12 h-12",
  lg: "w-16 h-16",
};

const textSizeMap = {
  xs: "text-sm",
  sm: "text-base",
  md: "text-lg",
  lg: "text-2xl",
};

export const PresentQLogo = ({ size = "sm", showText = false, className = "", linkTo = "/dashboard" }: PresentQLogoProps) => (
  <Link to={linkTo} className={`flex items-center gap-2.5 cursor-pointer ${className}`}>
    <img
      src={pqLogo}
      alt="PresentQ"
      className={`${imgSizeMap[size]} object-contain rounded-lg`}
    />
    {showText && (
      <span className={`font-display font-bold ${textSizeMap[size]} text-foreground tracking-tight`}>
        Present<span className="text-gradient-gold">Q</span>
      </span>
    )}
  </Link>
);

/** @deprecated Use PresentQLogo instead */
export const SpeakIQLogo = PresentQLogo;
