import { Layout } from '@/views/layouts/Layout';
import { Pagination } from '@/views/partials/Pagination';

interface WorkspaceItem {
  workspace: {
    id: string;
    status: string;
    publishedPort: number | null;
    swarmServiceName: string | null;
    createdAt: Date | string;
    startedAt: Date | string | null;
    stoppedAt: Date | string | null;
  };
  requester: { username: string };
  environment: { name: string };
}

interface AdminWorkspacesPageProps {
  username: string;
  isAdmin: boolean;
  workspaces: {
    items: WorkspaceItem[];
    page: number;
    pageCount: number;
    total: number;
  };
}

export function AdminWorkspacesPage({ username, isAdmin, workspaces }: AdminWorkspacesPageProps) {
  return (
    <Layout title="Workspaces - Admin - RPL GPU Platform" username={username} isAdmin={isAdmin}>
      <h1>Workspaces</h1>

      {workspaces.items.length === 0 ? (
        <p>No workspaces yet.</p>
      ) : (
        <>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Requester</th>
                  <th>Environment</th>
                  <th>Status</th>
                  <th>Port</th>
                  <th>Swarm Service</th>
                  <th>Created</th>
                  <th>Started</th>
                  <th>Stopped</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {workspaces.items.map((item) => (
                  <tr key={item.workspace.id}>
                    <td>{item.workspace.id.slice(0, 8)}</td>
                    <td>{item.requester.username}</td>
                    <td>{item.environment.name}</td>
                    <td>{item.workspace.status}</td>
                    <td>{item.workspace.publishedPort ?? '—'}</td>
                    <td>{item.workspace.swarmServiceName ?? '—'}</td>
                    <td>{String(item.workspace.createdAt)}</td>
                    <td>{item.workspace.startedAt ? String(item.workspace.startedAt) : '—'}</td>
                    <td>{item.workspace.stoppedAt ? String(item.workspace.stoppedAt) : '—'}</td>
                    <td>
                      {(item.workspace.status === 'starting' ||
                        item.workspace.status === 'running') && (
                        <form method="post" action={`/admin/workspaces/${item.workspace.id}/stop`}>
                          <button type="submit">Stop</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={workspaces.page}
            pageCount={workspaces.pageCount}
            total={workspaces.total}
            label="total"
            base="/admin/workspaces"
          />
        </>
      )}
    </Layout>
  );
}
