// Shared geometry for the history charts in the analysis panel. Both charts use
// the same width, padding and day slots, so a day sits at the same x in each and
// they read as one column of small multiples.
export const WIDTH = 420;
export const HEIGHT = 150;
export const PAD = { left: 34, right: 8, top: 18, bottom: 24 };
export const PLOT_W = WIDTH - PAD.left - PAD.right;
export const PLOT_H = HEIGHT - PAD.top - PAD.bottom;

export const slotWidth = (count) => PLOT_W / count;
export const slotCentre = (i, count) => PAD.left + (i + 0.5) * slotWidth(count);

export const shortDate = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

// Keeps the tooltip inside the card near either edge.
export const tooltipLeft = (x) => `${Math.min(85, Math.max(15, (x / WIDTH) * 100))}%`;
