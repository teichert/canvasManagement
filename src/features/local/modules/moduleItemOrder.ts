import { getDateFromString } from "../utils/timeUtils";

// A module's items are listed by date: an item's DateForOrdering when it has
// one, else when it becomes available, else when it's due, else when it
// closes. (A page's DateForOrdering is read into its dueAt.)
interface Dated {
  name: string;
  dueAt: string;
  unlockAt?: string;
  lockAt?: string;
  dateForOrdering?: string;
}

const orderingTime = (item: Dated) =>
  getDateFromString(
    item.dateForOrdering || item.unlockAt || item.dueAt || item.lockAt || ""
  )?.getTime() ?? 0;

export const byOrderingDate = (a: Dated, b: Dated) => orderingTime(a) - orderingTime(b);

/**
 * Whether Canvas lists a module's items (`canvasTitles`, in Canvas's order)
 * out of date order. Items with the same date can be in either order, and
 * Canvas items the module's files don't have are ignored.
 */
export function canvasOrderDiffers(items: Dated[], canvasTitles: string[]) {
  const times = canvasTitles.flatMap((title) => {
    const item = items.find((i) => i.name === title);
    return item ? [orderingTime(item)] : [];
  });
  return times.some((time, i) => i > 0 && time < times[i - 1]);
}

/**
 * Where item `name` goes in a Canvas module (`canvasTitles`, in Canvas's
 * order, without it): Canvas's 1-based position of the first item dated
 * after it, or undefined to put it at the end. Canvas items the module's
 * files don't have are passed over, and the rest are left where they are.
 */
export function positionInModule(name: string, items: Dated[], canvasTitles: string[]) {
  const item = items.find((i) => i.name === name);
  if (!item) return undefined;
  const later = canvasTitles.findIndex((title) => {
    const other = items.find((i) => i.name === title);
    return !!other && orderingTime(other) > orderingTime(item);
  });
  return later === -1 ? undefined : later + 1;
}
