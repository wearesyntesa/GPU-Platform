import { Layout } from '@/views/layouts/Layout';

interface LoginPageProps {
  error?: string;
  formUsername?: string;
  username?: string | null;
  isAdmin?: boolean;
  selfRegistrationEnabled?: boolean;
}

export function LoginPage({
  error,
  formUsername,
  username,
  isAdmin,
  selfRegistrationEnabled,
}: LoginPageProps) {
  return (
    <Layout title="Sign in - RPL GPU Platform" username={username} isAdmin={isAdmin}>
      <section className="auth-shell" aria-labelledby="login-title">
        <div className="auth-context">
          <p className="eyebrow">RPL GPU Platform</p>
          <h1 id="login-title">Sign in to your workspace</h1>
          <p className="subtitle">
            Manage GPU access, grants, and active Jupyter environments from the same dashboard.
          </p>
        </div>

        <div className="login-wrap auth-panel">
          <h2>Welcome back</h2>
          <p>Use your platform account to continue.</p>

          {error && (
            <div className="notice notice-danger">
              <strong>{error}</strong>
            </div>
          )}

          <form className="plain-form auth-form" method="post" action="/login">
            <label htmlFor="username">
              Username
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                defaultValue={formUsername || ''}
                required
              />
            </label>
            <label htmlFor="password">
              Password
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            <button type="submit" className="btn btn-primary auth-submit">
              Sign in
            </button>
          </form>

          {selfRegistrationEnabled && (
            <p className="auth-footer">
              Don't have an account? <a href="/register">Create one</a>
            </p>
          )}
        </div>
      </section>
    </Layout>
  );
}
