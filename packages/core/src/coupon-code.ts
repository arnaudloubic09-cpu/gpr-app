/**
 * Lecture d'un code de coupon saisi au clavier ou par une douchette USB.
 *
 * Une douchette se comporte comme un clavier. Réglée en QWERTY (réglage d'usine fréquent)
 * sur un ordinateur AZERTY, elle « tape » les touches au mauvais endroit :
 * chiffres → & é " ' ( - è _ ç à, tiret → ), A↔Q, Z↔W, M → ? (ou , en minuscule).
 * Tous les codes GPR contiennent des tirets : la présence de « ) » signale une douchette
 * mal réglée, et on rétablit alors le texte d'origine.
 */
const QWERTY_ON_AZERTY: Record<string, string> = {
  '&': '1',
  é: '2',
  '"': '3',
  "'": '4',
  '(': '5',
  '-': '6',
  è: '7',
  _: '8',
  ç: '9',
  à: '0',
  ')': '-',
  A: 'Q',
  Q: 'A',
  Z: 'W',
  W: 'Z',
  a: 'q',
  q: 'a',
  z: 'w',
  w: 'z',
  '?': 'M',
  ',': 'm',
};

export function looksLikeQwertyOnAzerty(raw: string): boolean {
  return raw.includes(')');
}

export function fixScannerLayout(raw: string): string {
  if (!looksLikeQwertyOnAzerty(raw)) return raw;
  return [...raw].map((ch) => QWERTY_ON_AZERTY[ch] ?? ch).join('');
}

/**
 * Forme canonique « GPR-XXXX-XXXX ». Accepte minuscules, espaces, absence de tirets ou de préfixe,
 * et une douchette réglée en QWERTY. Renvoie null si le texte n'est pas un code de coupon.
 */
export function normalizeCouponCode(raw: string): string | null {
  const n = fixScannerLayout(raw.trim())
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  const body = n.length === 8 ? n : /^GPR[A-Z0-9]{8}$/.test(n) ? n.slice(3) : null;
  if (!body || !/^[A-Z0-9]{8}$/.test(body)) return null;
  return `GPR-${body.slice(0, 4)}-${body.slice(4)}`;
}
