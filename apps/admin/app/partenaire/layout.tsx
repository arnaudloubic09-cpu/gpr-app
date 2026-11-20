import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = { title: 'GPR — Espace partenaire' };

export default function PartnerLayout({ children }: { children: ReactNode }) {
  return (
    <main className="partner">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="login-logo" src="/logo-dark.png" alt="GPR – Groupement Padel Référence" />
      {children}
    </main>
  );
}
