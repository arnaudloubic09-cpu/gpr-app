import { randomInt } from 'node:crypto';

/** Sans caractères ambigus (0/O, 1/I/L) : lisible et facile à saisir au comptoir. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Code de coupon aléatoire, ex. « GPR-7K4M-Q2XD » (≈ 8,5 × 10¹¹ combinaisons). */
export function generateCouponCode(): string {
  const pick = () => ALPHABET[randomInt(ALPHABET.length)];
  const block = () => Array.from({ length: 4 }, pick).join('');
  return `GPR-${block()}-${block()}`;
}
