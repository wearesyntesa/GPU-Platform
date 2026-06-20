import { ArrowLeft } from 'lucide-react';
import { Layout } from '@/views/layouts/Layout';

interface InvitationRow {
  id: string;
  email: string | null;
  role: string;
  createdByUsername: string | null;
  usedAt: Date | string | null;
  expiresAt: Date | string;
  createdAt: Date | string;
}

interface AdminUserInvitePageProps {
  username: string;
  isAdmin: boolean;
  invitations: InvitationRow[];
  newInviteUrl?: string;
  newInviteExpiresAt?: Date | string;
  error?: string;
  appUrl: string;
}

export function AdminUserInvitePage({
  username,
  isAdmin,
  invitations,
  newInviteUrl,
  newInviteExpiresAt,
  error,
}: AdminUserInvitePageProps) {
  return (
    <Layout title="Invite User - RPL GPU Platform" username={username} isAdmin={isAdmin}>
      <h1>Invite user</h1>

      {error && (
        <div className="notice notice-danger">
          <strong>{error}</strong>
        </div>
      )}

      {newInviteUrl && (
        <div className="notice notice-success">
          <strong>Invitation created</strong>
          <p className="notice-note break-anywhere">
            <a href={newInviteUrl}>{newInviteUrl}</a>
          </p>
          <small>
            Share this link. It expires {newInviteExpiresAt ? String(newInviteExpiresAt) : 'soon'} and
            can only be used once.
          </small>
        </div>
      )}

      <form className="plain-form" method="post" action="/admin/users/invite">
        <div>
          <label htmlFor="email">Email hint (optional)</label>
          <input
            id="email"
            name="email"
            type="email"
            maxLength={200}
            placeholder="Pre-fill email on register form"
          />
        </div>
        <div>
          <label htmlFor="role">Role</label>
          <select id="role" name="role">
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button type="submit" className="btn btn-primary">
          Generate invitation link
        </button>
      </form>

      {invitations.length > 0 && (
        <>
          <h2>Recent invitations</h2>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Email hint</th>
                  <th>Role</th>
                  <th>Created by</th>
                  <th>Expires</th>
                  <th>Used</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((inv) => (
                  <tr key={inv.id}>
                    <td>{inv.email ?? '—'}</td>
                    <td>{inv.role}</td>
                    <td>{inv.createdByUsername ?? '—'}</td>
                    <td>{String(inv.expiresAt)}</td>
                    <td>{inv.usedAt ? String(inv.usedAt) : 'Unused'}</td>
                    <td>
                      {!inv.usedAt && new Date(inv.expiresAt) > new Date() && (
                        <form method="post" action={`/admin/users/invite/${inv.id}/revoke`}>
                          <button type="submit">Revoke</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p>
        <a href="/admin/users" className="btn btn-back">
          <ArrowLeft size={16} aria-hidden="true" />
          Back to users
        </a>
      </p>
    </Layout>
  );
}
