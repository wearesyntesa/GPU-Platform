import { Layout } from '@/views/layouts/Layout';
import { Pagination } from '@/views/partials/Pagination';
import {
  Activity,
  CheckSquare,
  Monitor,
  Package,
  Server,
  Settings,
  Trash2,
  Users,
} from 'lucide-react';

interface PendingGrantItem {
  grant: {
    id: string;
    createdAt: Date | string;
    gpuTarget: string;
    requestedCpu: number;
    requestedMemoryGb: number;
    purpose: string | null;
  };
  user: { username: string };
  environment: { name: string };
}

interface AdminDashboardPageProps {
  username: string;
  isAdmin: boolean;
  pendingGrants: {
    items: PendingGrantItem[];
    page: number;
    pageCount: number;
    total: number;
  };
}

export function AdminDashboardPage({ username, isAdmin, pendingGrants }: AdminDashboardPageProps) {
  const shortcuts = [
    {
      href: '/admin/nodes',
      icon: <Server size={22} />,
      title: 'GPU Nodes',
      description: 'Capacity, worker health, and GPU inventory',
      group: 'Infrastructure',
    },
    {
      href: '/admin/workspaces',
      icon: <Monitor size={22} />,
      title: 'Workspaces',
      description: 'Running sessions and workspace lifecycle',
      group: 'Infrastructure',
    },
    {
      href: '/admin/environments',
      icon: <Package size={22} />,
      title: 'Environments',
      description: 'Runtime images available to students',
      group: 'Infrastructure',
    },
    {
      href: '/admin/grants',
      icon: <CheckSquare size={22} />,
      title: 'Access Grants',
      description: 'Approved allocations and revocation flow',
      group: 'Access',
    },
    {
      href: '/admin/users',
      icon: <Users size={22} />,
      title: 'Users',
      description: 'Accounts, roles, and invitation links',
      group: 'Access',
    },
    {
      href: '/admin/retention',
      icon: <Trash2 size={22} />,
      title: 'Retention',
      description: 'Idle cleanup and resource retention policy',
      group: 'Policy',
    },
    {
      href: '/admin/settings',
      icon: <Settings size={22} />,
      title: 'Settings',
      description: 'Registration and access control toggles',
      group: 'Policy',
    },
  ];

  return (
    <Layout title="Admin - RPL GPU Platform" username={username} isAdmin={isAdmin}>
      <section className="admin-hero">
        <div>
          <h1>Operations</h1>
          <p className="subtitle">
            Review access, monitor GPU capacity, and keep student workspaces healthy.
          </p>
        </div>
      </section>

      <section className="admin-section admin-review-panel">
        <div className="admin-section-header">
          <div>
            <h2>Pending access requests</h2>
          </div>
        </div>

        {pendingGrants.items.length === 0 ? (
          <div className="empty-state">
            <Activity size={22} aria-hidden="true" />
            <div>
              <strong>No pending access requests</strong>
              <p>New student GPU requests will appear here for review.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Created</th>
                    <th>Requester</th>
                    <th>Environment</th>
                    <th>GPU</th>
                    <th>CPU</th>
                    <th>Memory</th>
                    <th>Purpose</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingGrants.items.map((item) => (
                    <tr key={item.grant.id}>
                      <td>{String(item.grant.createdAt)}</td>
                      <td>{item.user.username}</td>
                      <td>{item.environment.name}</td>
                      <td>{item.grant.gpuTarget}</td>
                      <td>{item.grant.requestedCpu}</td>
                      <td>{item.grant.requestedMemoryGb} GB</td>
                      <td>{item.grant.purpose ?? ''}</td>
                      <td>
                        <a href={`/admin/grants/${item.grant.id}`} className="btn btn-ghost">
                          Review
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={pendingGrants.page}
              pageCount={pendingGrants.pageCount}
              total={pendingGrants.total}
              label="pending"
              base="/admin"
            />
          </>
        )}
      </section>

      <section className="admin-section">
        <div className="admin-section-header">
          <div>
            <h2>Admin areas</h2>
          </div>
        </div>
        <div className="admin-shortcuts">
          {shortcuts.map((shortcut) => (
            <a href={shortcut.href} className="bento-card admin-card" key={shortcut.href}>
              <div className="bento-icon">{shortcut.icon}</div>
              <span className="admin-card-group">{shortcut.group}</span>
              <h3>{shortcut.title}</h3>
              <p>{shortcut.description}</p>
            </a>
          ))}
        </div>
      </section>
    </Layout>
  );
}
