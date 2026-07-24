import { describe, expect, it } from "vitest";
import {
  PARK_ASK_MIN,
  PARK_AUTO_MIN,
  parkActionForConfidence,
  shouldAutoPark,
} from "../parkingConfidence";

describe("parkingConfidence", () => {
  it("exposes contract thresholds", () => {
    expect(PARK_AUTO_MIN).toBe(95);
    expect(PARK_ASK_MIN).toBe(80);
  });

  it("auto-parks only at ≥95", () => {
    expect(shouldAutoPark(94)).toBe(false);
    expect(shouldAutoPark(95)).toBe(true);
    expect(shouldAutoPark(100)).toBe(true);
  });

  it("maps bands to auto / ask / skip", () => {
    expect(parkActionForConfidence(100)).toBe("auto-park");
    expect(parkActionForConfidence(95)).toBe("auto-park");
    expect(parkActionForConfidence(94)).toBe("ask");
    expect(parkActionForConfidence(80)).toBe("ask");
    expect(parkActionForConfidence(79)).toBe("skip");
    expect(parkActionForConfidence(Number.NaN)).toBe("skip");
  });
});
