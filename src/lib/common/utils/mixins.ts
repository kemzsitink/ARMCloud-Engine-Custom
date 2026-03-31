import type { TouchInfo } from "../../types/index";

/** Generate randomised touch coordinate metadata for a single touch point. */
export const generateTouchCoord = (): TouchInfo => {
  const touchMajor = 80 + Math.floor(130 * Math.random());
  const touchMinor = touchMajor - (15 + Math.floor(30 * Math.random()));

  return {
    pressure: 0.5 + 0.3 * Math.random(),
    size: 0.05 + 0.03 * Math.random(),
    touchMajor,
    touchMinor,
    toolMajor: touchMajor,
    toolMinor: touchMinor,
  };
};
