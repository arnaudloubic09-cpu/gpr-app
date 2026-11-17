/**
 * URL de l'API. Sur un téléphone physique, remplacer localhost par l'IP locale de la machine
 * (ex. EXPO_PUBLIC_API_URL=http://192.168.1.20:3000 pnpm dev:mobile).
 */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
