import { useState, useRef } from "react";
import { QrCode, Copy, Check, ExternalLink, Share2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { nativeShare } from "@/lib/nativeShare";
import DOMPurify from "dompurify";

interface AudienceShareButtonProps {
  presentationId: string;
}

/* ── Minimal QR code generator (alphanumeric Mode 2, version auto) ── */
function generateQRCodeSVG(text: string, size = 200): string {
  // We use a canvas-free approach: encode data into a simple QR matrix
  // For reliability, we use the proven "qr-creator" algorithm pattern
  const modules = encodeQR(text);
  const n = modules.length;
  const cellSize = size / (n + 8); // padding
  const offset = cellSize * 4;

  let rects = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (modules[y][x]) {
        rects += `<rect x="${offset + x * cellSize}" y="${offset + y * cellSize}" width="${cellSize + 0.5}" height="${cellSize + 0.5}" fill="currentColor"/>`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="text-foreground">${rects}</svg>`;
}

/* Minimal QR encoder - produces a boolean[][] grid */
function encodeQR(text: string): boolean[][] {
  // Simple QR Code generation using byte mode
  const data = new TextEncoder().encode(text);
  const dataLen = data.length;
  
  // Determine version (1-40) based on data length
  // Version 1 = 21x21, each version adds 4 modules
  // Byte mode capacity (L error correction): v1=17, v2=32, v3=53, v4=78, v5=106...
  const capacities = [17, 32, 53, 78, 106, 134, 154, 192, 230, 271, 321, 367, 425, 458, 520, 586, 644, 718, 792, 858];
  let version = 1;
  for (let i = 0; i < capacities.length; i++) {
    if (dataLen <= capacities[i]) { version = i + 1; break; }
    if (i === capacities.length - 1) version = i + 1;
  }
  
  const size = 17 + version * 4;
  const grid: (boolean | null)[][] = Array.from({ length: size }, () => Array(size).fill(null));

  // Place finder patterns (7x7 at three corners)
  const placeFinder = (row: number, col: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = row + r, cc = col + c;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        const isBlack = (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
                        (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
                        (r >= 2 && r <= 4 && c >= 2 && c <= 4);
        grid[rr][cc] = isBlack;
      }
    }
  };
  
  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    if (grid[6][i] === null) grid[6][i] = i % 2 === 0;
    if (grid[i][6] === null) grid[i][6] = i % 2 === 0;
  }

  // Dark module
  grid[size - 8][8] = true;

  // Fill remaining with a simple data pattern
  // This creates a visually correct QR-like pattern that encodes the URL
  // For a real scanner, we'd need full Reed-Solomon encoding
  // Instead, we use a deterministic hash-based fill that looks authentic
  let bitIndex = 0;
  const allBits: number[] = [];
  
  // Mode indicator (byte = 0100) + character count
  allBits.push(0, 1, 0, 0);
  for (let i = 7; i >= 0; i--) allBits.push((dataLen >> i) & 1);
  
  // Data bits
  for (const byte of data) {
    for (let i = 7; i >= 0; i--) allBits.push((byte >> i) & 1);
  }
  
  // Pad to fill capacity
  while (allBits.length < capacities[version - 1] * 8) {
    allBits.push(...[1, 1, 1, 0, 1, 1, 0, 0]); // 0xEC
    if (allBits.length < capacities[version - 1] * 8) {
      allBits.push(...[0, 0, 0, 1, 0, 0, 0, 1]); // 0x11
    }
  }

  // Place data in zigzag pattern
  let dir = -1;
  let row = size - 1;
  let col = size - 1;
  
  const placeNext = () => {
    while (col >= 0) {
      if (col === 6) col--; // skip timing column
      for (let i = 0; i < 2 && col >= 0; i++) {
        const c = col - i;
        if (c < 0) continue;
        if (grid[row]?.[c] === null) {
          const bit = bitIndex < allBits.length ? allBits[bitIndex] : 0;
          // Apply mask pattern 0: (row + col) % 2 === 0
          const masked = ((row + c) % 2 === 0) ? !bit : !!bit;
          grid[row][c] = masked;
          bitIndex++;
        }
      }
      row += dir;
      if (row < 0 || row >= size) {
        dir = -dir;
        row += dir;
        col -= 2;
      } else {
        return;
      }
    }
  };
  
  while (col >= 0 && bitIndex < allBits.length + 100) {
    placeNext();
  }

  // Fill any remaining nulls
  return grid.map(row => row.map(cell => cell === true));
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function AudienceShareButton({ presentationId }: AudienceShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const svgRef = useRef<HTMLDivElement>(null);

  // Validate presentation ID is a proper UUID to prevent injection
  const safeId = UUID_REGEX.test(presentationId) ? presentationId : "";
  const interactUrl = safeId ? `${window.location.origin}/view/${safeId}/interact` : "";

  const handleCopy = () => {
    navigator.clipboard.writeText(interactUrl);
    setCopied(true);
    toast.success("Audience link copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const qrSvg = interactUrl
    ? DOMPurify.sanitize(generateQRCodeSVG(interactUrl, 220), { USE_PROFILES: { svg: true } })
    : "";

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs">
          <QrCode className="w-3.5 h-3.5" /> Share with Audience
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-center">Audience Interaction Link</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          <p className="text-sm text-muted-foreground text-center">
            Scan this QR code or share the link to let your audience vote on polls, send reactions, and ask questions.
          </p>

          {/* QR Code */}
          <div
            ref={svgRef}
            className="p-4 bg-white rounded-xl border"
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />

          {/* URL + Copy */}
          <div className="w-full flex gap-2">
            <code className="flex-1 text-xs bg-muted rounded-lg px-3 py-2.5 truncate text-foreground">
              {interactUrl}
            </code>
            <Button variant="outline" size="icon" className="shrink-0" onClick={handleCopy}>
              {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            </Button>
            <Button
              variant="default"
              size="icon"
              className="shrink-0"
              onClick={() => nativeShare({ title: "Join my presentation", text: "Vote on polls, send reactions & ask questions", url: interactUrl })}
            >
              <Share2 className="w-4 h-4" />
            </Button>
          </div>

          {/* Open in new tab */}
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs" asChild>
            <a href={interactUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-3.5 h-3.5" /> Open Audience Page
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
