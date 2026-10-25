import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Normalize a phone number for WhatsApp Click to Chat (wa.me):
 * digits only, no leading "+", spaces, dashes, brackets; converts a
 * trunk-prefixed local number (e.g. Morocco "06...") to international
 * format ("2126..."). Returns "" when nothing usable remains.
 */
export function normalizeWhatsappNumber(raw: string | null | undefined): string {
  if (!raw) return "";
  let digits = raw.replace(/[^0-9]/g, "");
  digits = digits.replace(/^00/, ""); // international dialing prefix
  if (digits.startsWith("0")) {
    // Local Moroccan number (e.g. 0612...) -> 2126...
    digits = `212${digits.replace(/^0+/, "")}`;
  }
  return digits;
}
