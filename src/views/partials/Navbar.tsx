interface NavbarProps {
  username?: string | null;
  isAdmin?: boolean;
}

export function Navbar({ username, isAdmin }: NavbarProps) {
  if (!username) return null;
  return (
    <nav className="tabs">
      <div className="nav-links">
        <a href="/">Home</a>
        <a href="/workspaces/active">Workspace</a>
        <a href="/grants">Access</a>
        {isAdmin && <a href="/admin">Admin</a>}
      </div>
      <form method="post" action="/logout">
        <button type="submit">Logout</button>
      </form>
    </nav>
  );
}
