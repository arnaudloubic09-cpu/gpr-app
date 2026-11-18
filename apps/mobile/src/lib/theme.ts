/**
 * Charte GPR : design épuré, anthracite + jaune padel (bandeau padelreference.com).
 * Le jaune sert aux actions et aux accents ; l'anthracite à la structure et au texte.
 */
export const colors = {
  bg: '#F6F6F4',
  card: '#FFFFFF',
  text: '#1F2124',
  muted: '#6B6E73',
  border: '#E5E5E2',
  /** Anthracite : structure, texte fort, éléments actifs */
  primary: '#2B2D31',
  /** Jaune clair : fonds d'icônes, mises en avant discrètes */
  primarySoft: '#FDF3C4',
  /** Jaune padel : boutons principaux, accents */
  accent: '#F5C518',
  danger: '#B42318',
  dangerSoft: '#FDE8E7',
  success: '#2F7D4F',
};

export const fonts = {
  /** Titres : police à empattements proche du logo GPR */
  display: 'PlayfairDisplay_700Bold',
  displaySemi: 'PlayfairDisplay_600SemiBold',
};

export const radius = { sm: 10, md: 14, lg: 20 };
export const space = (n: number) => n * 4;
