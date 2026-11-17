import { ActionForm } from '@/components/action-form';
import { Badge, PageHeader } from '@/components/ui';
import { apiGet } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { getMe } from '@/lib/session';
import { createAdmin, toggleAdmin } from './actions';

type Admin = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  disabledAt: string | null;
  lastLoginAt: string | null;
  club: { name: string } | null;
};

export default async function AccountsPage() {
  const [admins, clubs, me] = await Promise.all([
    apiGet<Admin[]>('/admin/users'),
    apiGet<{ id: string; name: string }[]>('/clubs'),
    getMe(),
  ]);
  return (
    <>
      <PageHeader
        title="Comptes admin"
        subtitle="Les comptes joueur et admin sont séparés : un email ne peut avoir qu’un seul rôle."
      />
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nom</th>
              <th>Email</th>
              <th>Rôle</th>
              <th>Dernière connexion</th>
              <th>Statut</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.id}>
                <td>
                  {a.firstName} {a.lastName}
                </td>
                <td>{a.email}</td>
                <td>{a.role === 'SUPER_ADMIN' ? 'Super admin' : `Admin · ${a.club?.name}`}</td>
                <td className="small">{dateTime(a.lastLoginAt)}</td>
                <td>
                  {a.disabledAt ? (
                    <Badge tone="danger">Désactivé</Badge>
                  ) : (
                    <Badge tone="ok">Actif</Badge>
                  )}
                </td>
                <td>
                  {a.id === me?.id ? (
                    <span className="muted small">Vous</span>
                  ) : (
                    <ActionForm
                      action={toggleAdmin.bind(null, a.id, a.disabledAt ? 'enable' : 'disable')}
                      submitLabel={a.disabledAt ? 'Réactiver' : 'Désactiver'}
                      variant={a.disabledAt ? 'secondary' : 'danger'}
                      confirm={
                        a.disabledAt
                          ? undefined
                          : `Désactiver ${a.email} ? Ses sessions seront fermées immédiatement.`
                      }
                      className="inline-form"
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Nouveau compte admin</h2>
      <ActionForm
        action={createAdmin}
        submitLabel="Créer le compte"
        successMessage="Compte créé : la personne peut se connecter avec son email."
        className="card"
      >
        <div className="form-grid">
          <div>
            <label htmlFor="firstName">Prénom</label>
            <input id="firstName" name="firstName" required />
          </div>
          <div>
            <label htmlFor="lastName">Nom</label>
            <input id="lastName" name="lastName" required />
          </div>
          <div>
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required />
          </div>
          <div>
            <label htmlFor="role">Rôle</label>
            <select id="role" name="role" defaultValue="CLUB_ADMIN">
              <option value="CLUB_ADMIN">Admin club</option>
              <option value="SUPER_ADMIN">Super admin GPR</option>
            </select>
          </div>
          <div>
            <label htmlFor="clubId">Club (admin club)</label>
            <select id="clubId" name="clubId">
              <option value="">—</option>
              {clubs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </ActionForm>
    </>
  );
}
