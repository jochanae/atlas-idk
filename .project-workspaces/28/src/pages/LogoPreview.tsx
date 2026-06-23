import logoMonogram from "@/assets/logo-concept-pq-monogram.png";
import logoPlayQ from "@/assets/logo-concept-play-q.png";
import logoPodium from "@/assets/logo-concept-podium.png";
import logoGoldQ from "@/assets/logo-concept-gold-q.png";

const logos = [
  { src: logoMonogram, label: "Option 1 — PQ Monogram" },
  { src: logoPlayQ, label: "Option 2 — Play Button + Q" },
  { src: logoPodium, label: "Option 3 — Podium" },
  { src: logoGoldQ, label: "Option 4 — Gold Q" },
];

export default function LogoPreview() {
  return (
    <div className="min-h-screen bg-background p-6 flex flex-col items-center gap-8">
      <h1 className="text-2xl font-display font-bold text-foreground">PresentQ Logo Concepts</h1>
      {logos.map((logo) => (
        <div key={logo.label} className="flex flex-col items-center gap-3 w-full max-w-xs">
          <h2 className="text-lg font-semibold text-foreground">{logo.label}</h2>
          <div className="bg-card rounded-xl border border-border p-6 w-full flex items-center justify-center">
            <img src={logo.src} alt={logo.label} className="w-40 h-40 object-contain" />
          </div>
        </div>
      ))}
    </div>
  );
}
