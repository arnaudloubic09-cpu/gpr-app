'use client';

import { useState } from 'react';

/** Copie un texte (lien) dans le presse-papiers. */
export function CopyButton({ text, label = 'Copier' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="secondary"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 2000);
      }}
    >
      {done ? 'Copié ✓' : label}
    </button>
  );
}
