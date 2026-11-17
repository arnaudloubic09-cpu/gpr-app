import { describe, expect, it } from 'vitest';
import { fixScannerLayout, normalizeCouponCode } from './coupon-code';

/** Simule une douchette réglée en QWERTY branchée sur un ordinateur en AZERTY. */
function qwertyScannerOnAzerty(text: string): string {
  const digits: Record<string, string> = {
    '1': '&',
    '2': 'é',
    '3': '"',
    '4': "'",
    '5': '(',
    '6': '-',
    '7': 'è',
    '8': '_',
    '9': 'ç',
    '0': 'à',
  };
  const swap: Record<string, string> = { A: 'Q', Q: 'A', Z: 'W', W: 'Z', M: '?', '-': ')' };
  return [...text].map((c) => digits[c] ?? swap[c] ?? c).join('');
}

describe('normalizeCouponCode', () => {
  it.each([
    ['GPR-7K4M-Q2XD', 'GPR-7K4M-Q2XD'],
    ['gpr-7k4m-q2xd', 'GPR-7K4M-Q2XD'],
    ['  GPR 7K4M Q2XD ', 'GPR-7K4M-Q2XD'],
    ['GPR7K4MQ2XD', 'GPR-7K4M-Q2XD'],
    ['7K4M-Q2XD', 'GPR-7K4M-Q2XD'],
  ])('« %s » → %s', (input, expected) => {
    expect(normalizeCouponCode(input)).toBe(expected);
  });

  it('refuse un texte qui n’est pas un code GPR', () => {
    expect(normalizeCouponCode('bonjour')).toBeNull();
    expect(normalizeCouponCode('GPR-123')).toBeNull();
    expect(normalizeCouponCode('')).toBeNull();
  });

  it.each(['GPR-7K4M-Q2XD', 'GPR-AZQW-M9M2', 'GPR-2345-6789', 'GPR-WZAQ-QMAZ'])(
    'corrige une douchette réglée en QWERTY sur un poste AZERTY (%s)',
    (code) => {
      const typed = qwertyScannerOnAzerty(code);
      expect(typed).not.toBe(code);
      expect(normalizeCouponCode(typed)).toBe(code);
    },
  );

  it('ne touche pas une saisie correcte contenant A, Q, Z, W ou M', () => {
    expect(fixScannerLayout('GPR-AZQW-M9M2')).toBe('GPR-AZQW-M9M2');
  });
});
