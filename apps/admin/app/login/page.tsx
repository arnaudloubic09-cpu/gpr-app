import { LoginForm } from './login-form';

export default function LoginPage() {
  return (
    <main>
      <div className="card">
        <h1>Back-office GPR</h1>
        <p className="muted">Espace réservé aux administrateurs des clubs et du groupement.</p>
        <LoginForm />
      </div>
    </main>
  );
}
