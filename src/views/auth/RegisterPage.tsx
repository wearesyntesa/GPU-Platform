import { Layout } from '@/views/layouts/Layout';

interface RegisterPageProps {
  token?: string;
  email?: string;
  error?: string;
  selfRegistrationEnabled?: boolean;
  requireInvitation?: boolean;
  tokenInvalid?: boolean;
}

export function RegisterPage({
  token,
  email,
  error,
  selfRegistrationEnabled,
  tokenInvalid,
}: RegisterPageProps) {
  if (!selfRegistrationEnabled && !token) {
    return (
      <Layout title="Registration Closed - RPL GPU Platform">
        <div className="login-wrap auth-panel auth-state-panel">
          <h1>Registration closed</h1>
          <p>Registration is not open. Contact an administrator to get access.</p>
          <p>
            <a href="/login" className="btn btn-ghost">
              Back to sign in
            </a>
          </p>
        </div>
      </Layout>
    );
  }

  if (tokenInvalid) {
    return (
      <Layout title="Invalid Invitation - RPL GPU Platform">
        <div className="login-wrap auth-panel auth-state-panel">
          <h1>Invalid invitation</h1>
          <p>
            This invitation link has expired or already been used. Request a new one from an
            administrator.
          </p>
          <p>
            <a href="/login" className="btn btn-ghost">
              Back to sign in
            </a>
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Create account - RPL GPU Platform">
      <section className="auth-shell" aria-labelledby="register-title">
        <div className="auth-context">
          <p className="eyebrow">RPL GPU Platform</p>
          <h1 id="register-title">Create your workspace account</h1>
          <p className="subtitle">
            Join the same dashboard used to request grants and launch GPU-backed workspaces.
          </p>
        </div>

        <div className="login-wrap auth-panel">
          <h2>Account details</h2>
          <p>Choose credentials to get started.</p>

          {error && (
            <div className="notice notice-danger">
              <strong>{error}</strong>
            </div>
          )}

          <form className="plain-form auth-form" method="post" action="/register">
            {token && <input type="hidden" name="token" value={token} />}
            <div>
              <label htmlFor="fullName">Full name</label>
              <input
                id="fullName"
                name="fullName"
                type="text"
                autoComplete="name"
                required
                maxLength={50}
              />
            </div>
            <div>
              <label htmlFor="email">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                defaultValue={email ?? ''}
                required
                maxLength={200}
              />
            </div>
            <div>
              <label htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
              />
            </div>
            <div>
              <label htmlFor="confirmPassword">Confirm password</label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
              />
            </div>
            <button type="submit" className="btn btn-primary auth-submit">
              Create account
            </button>
          </form>

          <p className="auth-footer">
            Already have an account? <a href="/login">Sign in</a>
          </p>
        </div>
      </section>
    </Layout>
  );
}
