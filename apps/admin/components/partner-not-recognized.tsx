/** Téléphone du partenaire pas (ou plus) reconnu : il doit ouvrir son lien personnel. */
export function NotRecognized({ replaced }: { replaced?: boolean }) {
  return (
    <div className="card counter-result KO">
      <h2>{replaced ? 'Lien remplacé' : 'Téléphone non reconnu'}</h2>
      <p>
        {replaced
          ? 'Ce lien partenaire a été remplacé. Demandez le nouveau lien à votre club, puis ouvrez-le sur ce téléphone.'
          : 'Ouvrez d’abord le lien personnel envoyé par votre club, sur le téléphone qui servira à scanner les QR codes des joueurs.'}
      </p>
    </div>
  );
}
