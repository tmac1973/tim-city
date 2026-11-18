/**
 * Season blend for a game month (0 = January) and how far through it we
 * are (0–1). Snow builds through December, lies in January and February
 * and melts through March; leaves turn in September, stay turned through
 * October and November and fall as December's snow arrives.
 */
export function seasonBlend(month: number, through: number, firstYear = false): { snow: number; autumn: number } {
  const t = Math.min(1, Math.max(0, through));
  // Snow needs a December to build up: a city founded in January starts green.
  if (firstYear && month <= 2) return { snow: 0, autumn: 0 };
  switch (month) {
    case 11:
      return { snow: t, autumn: 1 - t };
    case 0:
    case 1:
      return { snow: 1, autumn: 0 };
    case 2:
      return { snow: 1 - t, autumn: 0 };
    case 8:
      return { snow: 0, autumn: t };
    case 9:
    case 10:
      return { snow: 0, autumn: 1 };
    default:
      return { snow: 0, autumn: 0 };
  }
}

export const isWinter = (month: number): boolean => month === 11 || month === 0 || month === 1;
