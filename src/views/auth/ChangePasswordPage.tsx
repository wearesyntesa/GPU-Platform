import { Layout } from '@/views/layouts/Layout';

interface ChangePasswordPageProps {
  username: string;
  isAdmin: boolean;
  error?: string;
}

export function ChangePasswordPage({ username, isAdmin, error }: ChangePasswordPageProps) {
  return (
    <Layout title="Change password - RPL GPU Platform" username={username} isAdmin={isAdmin}>
      <h1>Change password</h1>
      <p>Your account is using a temporary password. Choose a new password to continue.</p>

      {error && <div className="notice notice-danger">{error}</div>}

      <form className="plain-form" method="post" action="/change-password">
        <label htmlFor="password">New password</label>
        <input id="password" type="password" name="password" required minLength={8} />

        <label htmlFor="confirmPassword">Confirm password</label>
        <input id="confirmPassword" type="password" name="confirmPassword" required minLength={8} />

        <div className="form-actions">
          <button type="submit" className="btn btn-primary">
            Change password
          </button>
        </div>
      </form>
    </Layout>
  );
}
