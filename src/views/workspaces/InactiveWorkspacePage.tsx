import { Layout } from '@/views/layouts/Layout';

interface InactiveWorkspacePageProps {
  username: string;
  isAdmin: boolean;
  workspace: {
    id: string;
    status: string;
    stopReason?: string | null;
    stoppedAt?: Date | null;
    failureReason?: string | null;
  };
}

function stopReasonLabel(reason?: string | null): string {
  if (reason === 'expired') return 'This session ended automatically.';
  if (reason === 'idle_timeout') return 'This session stopped after being idle.';
  if (reason === 'user_stopped') return 'This session was stopped by user request.';
  if (reason) return `Session stopped: ${reason}.`;
  return 'This session is no longer active.';
}

export function InactiveWorkspacePage({
  username,
  isAdmin,
  workspace,
}: InactiveWorkspacePageProps) {
  return (
    <Layout title="Session ended - RPL GPU Platform" username={username} isAdmin={isAdmin}>
      <h1>Session ended</h1>
      <p>This notebook link is no longer active.</p>
      <p>
        Status: <strong>{workspace.status}</strong>
      </p>
      <p>{stopReasonLabel(workspace.stopReason)}</p>
      {workspace.stoppedAt && <p>Stopped at: {workspace.stoppedAt.toLocaleString()}</p>}
      {workspace.failureReason && <p>Failure: {workspace.failureReason}</p>}
      <p>
        <a href="/workspaces/active" className="btn btn-primary">
          Back to workspace
        </a>
      </p>
    </Layout>
  );
}
