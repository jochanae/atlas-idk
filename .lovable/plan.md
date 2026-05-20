# Axiom — Build Plan
Status: Cursor-first. Lovable is no longer the primary build tool for this project.

## Current architecture
- Frontend: atlas-idk → Vercel → axiomsystem.app
- Backend: Axiom-Atlas → Render → axiom-atlas.onrender.com
- Database: Neon
- Primary tool: Cursor (all files)
- Lovable: reserved for isolated UI components only

## North star
One unified workspace. Conversation as the root layer. Tools emerge contextually. See ATLAS_CONSTITUTION.md Section V.

## Build order
1. Single source of truth endpoint
2. Unified conversation spine
3. Contextual tool emergence
4. Visual state transitions
