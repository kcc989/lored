import { differenceInDays } from 'date-fns';

export function serilizeDate(date: Date | null): number | null {
  return date ? date.getTime() : null;
}

export function deserializeDate(epochMillis: number | null): Date | null {
  return epochMillis ? new Date(epochMillis) : null;
}

export function calculateAgeInDays(
  initialDate: Date,
  anchorDate: Date = new Date()
): number {
  return differenceInDays(anchorDate, initialDate);
}
