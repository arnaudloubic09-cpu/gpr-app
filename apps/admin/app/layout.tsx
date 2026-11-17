import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'GPR — Back-office', robots: { index: false } };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
