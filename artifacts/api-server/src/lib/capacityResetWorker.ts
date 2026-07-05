/**
 * capacityResetWorker
 *
 * Polls every 5 minutes and resets daily/monthly capacity counters when due.
 */

import { resetDuePools } from "./capacity";
import { logger } from "./logger";

const POLL_INTERVAL_MS = 5 * 60_000;

export function startCapacityResetWorker(): void {
  const tick = async () => {
    try {
      const count = await resetDuePools();
      if (count > 0) {
        logger.info({ count }, "capacity reset worker: pools updated");
      }
    } catch (err) {
      logger.warn({ err }, "capacity reset worker: tick failed");
    }
  };

  void tick();
  setInterval(() => { void tick(); }, POLL_INTERVAL_MS);
  logger.info("capacity reset worker started");
}
