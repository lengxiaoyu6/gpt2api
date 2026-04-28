import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const CREDITS_PER_UNIT = 10_000

export function formatCredit(value: number | null | undefined) {
  if (value == null) return "0"

  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return "0"

  return (numericValue / CREDITS_PER_UNIT).toFixed(2)
}
