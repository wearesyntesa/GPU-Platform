import { Layout } from '@/views/layouts/Layout';
import { AlertTriangle, ArrowLeft, UserPlus, Copy, Check } from 'lucide-react';
import { useState } from 'react';

interface UserRow {
  id: string;
  fullName: string;
  email: string | null;
  role: string;
  status: string;
  createdAt: Date | string;
}

interface AdminUsersPageProps {
  fullName: string;
  isAdmin: boolean;
  users: UserRow[];
  message: string | null;
  temporaryPassword?: {
    fullName: string;
    password: string;
  };
}

export function AdminUsersPage({
  fullName,
  isAdmin,
  users,
  message,
  temporaryPassword,
}: AdminUsersPageProps) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  const handleCopy = async () => {
    if (!temporaryPassword) return;
    try {
      await navigator.clipboard.writeText(temporaryPassword.password);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
    setTimeout(() => setCopyStatus('idle'), 2000);
  };

  return (
    <Layout title="Users - RPL GPU Platform" fullName={fullName} isAdmin={isAdmin}>
      <div className="page-actions">
        <h1>Users</h1>
        <div className="button-group">
          <a href="/admin/users/invite" className="btn btn-ghost">
            Invite user
          </a>
          <a href="/admin/users/new" className="btn btn-primary">
            <UserPlus size={15} />
            Add user
          </a>
        </div>
      </div>

      {message && <div className="notice">{message}</div>}

      {temporaryPassword && (
        <div className="notice notice-warning">
          <strong className="notice-title-inline">
            <AlertTriangle size={15} />
            Temporary password for {temporaryPassword.fullName}
          </strong>
          <div className="password-display">
            <code className="password-value">{temporaryPassword.password}</code>
            <button
              type="button"
              onClick={handleCopy}
              className="btn btn-ghost"
              aria-label="Copy password"
            >
              {copyStatus === 'copied' ? (
                <>
                  <Check size={14} />
                  Copied!
                </>
              ) : copyStatus === 'failed' ? (
                'Copy failed'
              ) : (
                <>
                  <Copy size={14} />
                  Copy
                </>
              )}
            </button>
          </div>
          <p className="notice-note">
            Copy this now. It will not be shown again.
          </p>
        </div>
      )}

      {users.length === 0 ? (
        <p>No users found.</p>
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Full name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.fullName}</td>
                  <td>{user.email ?? '—'}</td>
                  <td>{user.role}</td>
                  <td>{user.status}</td>
                  <td>{String(user.createdAt)}</td>
                  <td>
                    <div className="button-group">
                      {user.status === 'active' ? (
                        <form method="post" action={`/admin/users/${user.id}/disable`}>
                          <button type="submit">Disable</button>
                        </form>
                      ) : (
                        <form method="post" action={`/admin/users/${user.id}/enable`}>
                          <button type="submit">Enable</button>
                        </form>
                      )}
                      {user.role === 'user' ? (
                        <form method="post" action={`/admin/users/${user.id}/role`}>
                          <input type="hidden" name="role" value="admin" />
                          <button type="submit">Make admin</button>
                        </form>
                      ) : (
                        <form method="post" action={`/admin/users/${user.id}/role`}>
                          <input type="hidden" name="role" value="user" />
                          <button type="submit">Make user</button>
                        </form>
                      )}
                      <form method="post" action={`/admin/users/${user.id}/reset-password`}>
                        <button type="submit">Reset password</button>
                      </form>
                      <form method="post" action={`/admin/users/${user.id}/delete`}>
                        <button type="submit" className="btn-danger">
                          Delete
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p>
        <a href="/admin" className="btn btn-back">
          <ArrowLeft size={16} aria-hidden="true" />
          Back to admin
        </a>
      </p>
    </Layout>
  );
}
