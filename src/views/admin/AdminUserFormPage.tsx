import { Layout } from '@/views/layouts/Layout';

interface AdminUserFormPageProps {
  username: string;
  isAdmin: boolean;
  error?: string;
}

export function AdminUserFormPage({ username, isAdmin, error }: AdminUserFormPageProps) {
  return (
    <Layout title="Add User - RPL GPU Platform" username={username} isAdmin={isAdmin}>
      <h1>Add user</h1>

      {error && (
        <div className="notice notice-danger">
          <strong>{error}</strong>
        </div>
      )}

      <form className="plain-form" method="post" action="/admin/users">
        <div>
          <label htmlFor="username">Username</label>
          <input
            id="username"
            name="username"
            type="text"
            required
            maxLength={50}
            autoComplete="off"
          />
        </div>
        <div>
          <label htmlFor="email">Email (optional)</label>
          <input id="email" name="email" type="email" maxLength={200} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>
        <div>
          <label htmlFor="role">Role</label>
          <select id="role" name="role">
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div className="btn-row">
          <button type="submit" className="btn btn-primary">
            Create user
          </button>
          <a href="/admin/users" className="btn btn-ghost">
            Cancel
          </a>
        </div>
      </form>
    </Layout>
  );
}
