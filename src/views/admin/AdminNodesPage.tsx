import { ArrowLeft } from 'lucide-react';
import { Layout } from '@/views/layouts/Layout';

interface ActiveWorkspace {
  id: string;
  status: string;
  requester: string;
  environment: string;
  startedAt: Date | null;
  expiresAt: Date | null;
}

interface NodeItem {
  id: string;
  name: string;
  address: string;
  gpuType: string;
  gpuCount: number;
  vramGb: number | null;
  cpuTotal: number | null;
  memoryTotalGb: number | null;
  statusLabel: string;
  enabled: boolean;
  maintenance: boolean;
  lastSeenAt: Date | null;
  activeWorkspace: ActiveWorkspace | null;
}

interface AdminNodesPageProps {
  username: string;
  isAdmin: boolean;
  nodes: NodeItem[];
}

export function AdminNodesPage({ username, isAdmin, nodes }: AdminNodesPageProps) {
  return (
    <Layout title="Nodes - RPL GPU Platform" username={username} isAdmin={isAdmin}>
      <h1>GPU Nodes</h1>

      {nodes.length === 0 ? (
        <p>No Swarm GPU nodes synced yet.</p>
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Address</th>
                <th>GPU model</th>
                <th>GPU units</th>
                <th>VRAM GB</th>
                <th>CPU cores</th>
                <th>RAM GB</th>
                <th>Status</th>
                <th>Current workspace</th>
                <th>Enabled</th>
                <th>Maintenance</th>
                <th>Last seen</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((node) => (
                <tr key={node.id}>
                  <td>{node.name}</td>
                  <td>{node.address}</td>
                  <td>{node.gpuType}</td>
                  <td>{node.gpuCount}</td>
                  <td>{node.vramGb ?? '—'}</td>
                  <td>{node.cpuTotal ?? '—'}</td>
                  <td>{node.memoryTotalGb ?? '—'}</td>
                  <td>{node.statusLabel}</td>
                  <td>
                    {node.activeWorkspace ? (
                      <>
                        {node.activeWorkspace.requester} &middot; {node.activeWorkspace.environment}{' '}
                        &middot; {node.activeWorkspace.status}
                        {node.activeWorkspace.expiresAt && (
                          <div>
                            expires {String(node.activeWorkspace.expiresAt)}
                          </div>
                        )}
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>{node.enabled ? 'yes' : 'no'}</td>
                  <td>{node.maintenance ? 'yes' : 'no'}</td>
                  <td>{node.lastSeenAt ? String(node.lastSeenAt) : '—'}</td>
                  <td>
                    <form method="post" action={`/admin/nodes/${node.id}/toggle-enabled`}>
                      <button type="submit">{node.enabled ? 'Disable' : 'Enable'}</button>
                    </form>
                    <form method="post" action={`/admin/nodes/${node.id}/toggle-maintenance`}>
                      <button type="submit">
                        {node.maintenance ? 'Clear maintenance' : 'Maintenance'}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="back-action">
        <a href="/admin" className="btn btn-back">
          <ArrowLeft size={16} aria-hidden="true" />
          Back to admin
        </a>
      </p>
    </Layout>
  );
}
