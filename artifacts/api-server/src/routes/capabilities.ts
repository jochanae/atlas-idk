/**
 * GET /api/capabilities
 *
 * Runtime feature-capability flags. The frontend fetches this once at app
 * startup so client behaviour is always in sync with server configuration.
 * No auth required — the response contains no user data.
 */

import { Router } from "express";

const router = Router();

router.get("/capabilities", (_req, res) => {
  res.json({
    
  });
});

export default router;
