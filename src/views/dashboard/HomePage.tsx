import { Layout } from '@/views/layouts/Layout';
import { Monitor, Plus, FileText } from 'lucide-react';

interface HomePageProps {
  fullName: string;
  role: string;
  isAdmin: boolean;
}

export function HomePage({ fullName, role, isAdmin }: HomePageProps) {
  return (
    <Layout title="RPL GPU Platform" fullName={fullName} isAdmin={isAdmin}>
      <div className="hero-section">
        <h1>Welcome, {fullName}</h1>
        <p className="subtitle">Manage your GPU resources and workspace access.</p>
      </div>

      <div className="bento-grid">
        <a href="/workspaces/active" className="bento-card">
          <div className="bento-icon">
            <Monitor size={22} />
          </div>
          <h3>Active Workspace</h3>
          <p>Access your currently running Jupyter workspace</p>
        </a>
        <a href="/grants/new" className="bento-card">
          <div className="bento-icon">
            <Plus size={22} />
          </div>
          <h3>Request Access</h3>
          <p>Request new GPU allocations for your projects</p>
        </a>
        <a href="/grants" className="bento-card">
          <div className="bento-icon">
            <FileText size={22} />
          </div>
          <h3>My Grants</h3>
          <p>View the status of your current and past access requests</p>
        </a>
      </div>
    </Layout>
  );
}
