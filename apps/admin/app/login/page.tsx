import { LoginForm } from './login-form';

export default function LoginPage() {
  return (
    <main>
      <div className="card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-dark.png" alt="GPR – Groupement Padel Référence" className="login-logo" />
        <h1 style={{ textAlign: 'center' }}>Back-office</h1>
        <p className="muted" style={{ textAlign: 'center' }}>
          Espace réservé aux administrateurs des clubs et du groupement.
        </p>
        <LoginForm />
      </div>
    </main>
  );
}
