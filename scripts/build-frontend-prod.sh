#!/bin/bash
set -e

echo "[build-frontend] Building frontend..."
pnpm --filter @workspace/atlas-frontend run build

echo "[build-frontend] Removing API server source maps..."
find artifacts/api-server/dist -name "*.map" -delete 2>/dev/null || true

echo "[build-frontend] Removing large packages that are no longer needed at runtime..."

# Frontend-only packages (bundled into dist/public/ by Vite — not needed at runtime)
rm -rf node_modules/.pnpm/react-icons*/
rm -rf node_modules/.pnpm/lucide-react*/
rm -rf node_modules/.pnpm/three*/
rm -rf node_modules/.pnpm/pdfjs-dist*/
rm -rf node_modules/.pnpm/date-fns*/
rm -rf node_modules/.pnpm/jspdf*/
rm -rf node_modules/.pnpm/html2pdf.js*/
rm -rf node_modules/.pnpm/web-streams-polyfill*/
rm -rf node_modules/.pnpm/core-js*/
rm -rf node_modules/.pnpm/@shikijs*/

# Test tools (never needed at runtime)
rm -rf node_modules/.pnpm/playwright*/
rm -rf node_modules/.pnpm/@playwright*/
rm -rf node_modules/.pnpm/chromium-bidi*/
rm -rf node_modules/.pnpm/vitest*/
rm -rf node_modules/.pnpm/@testing-library*/
rm -rf node_modules/.pnpm/jsdom*/

# Build tools (builds are complete — safe to remove)
rm -rf node_modules/.pnpm/typescript*/
rm -rf node_modules/.pnpm/esbuild*/
rm -rf node_modules/.pnpm/drizzle-kit*/
rm -rf node_modules/.pnpm/vite*/
rm -rf node_modules/.pnpm/@vitejs*/
rm -rf node_modules/.pnpm/tailwindcss*/
rm -rf node_modules/.pnpm/@tailwindcss*/
rm -rf node_modules/.pnpm/lightningcss*/

echo "[build-frontend] node_modules size after cleanup: $(du -sh node_modules | cut -f1)"
