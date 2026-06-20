interface LandingPageProps {
  selfRegistrationEnabled: boolean;
}

export function LandingPage({ selfRegistrationEnabled }: LandingPageProps) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>RPL GPU Platform</title>
        <link rel="icon" href="data:," />
        <link rel="stylesheet" href="/app.css" />
      </head>
      <body>
        <div className="landing-page">
          <nav>
            <div className="landing-nav">
              <a href="/" className="landing-nav-brand">
                RPL GPU Platform
              </a>
              <div className="landing-nav-actions">
                {selfRegistrationEnabled && (
                  <a href="/register" className="btn btn-ghost">
                    Register
                  </a>
                )}
                <a href="/login" className="btn btn-primary">
                  Sign in
                </a>
              </div>
            </div>
          </nav>

          <section className="landing-hero">
            <h1>GPU workspaces for RPL students.</h1>
            <p className="landing-hero-sub">
              Request access to a dedicated GPU-backed Jupyter environment. Get approved by your
              instructor and launch in about a minute.
            </p>
            <div className="landing-hero-actions">
              <a href="/login" className="btn btn-primary">
                Sign in
              </a>
              {selfRegistrationEnabled && (
                <a href="/register" className="btn btn-ghost">
                  Create account
                </a>
              )}
            </div>
          </section>

          <footer>
            <div className="landing-footer">SE LAB UNESA</div>
          </footer>
        </div>
      </body>
    </html>
  );
}
