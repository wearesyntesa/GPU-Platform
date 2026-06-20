import { ArrowLeft } from 'lucide-react';
import { Layout } from '@/views/layouts/Layout';

interface RetentionSettings {
  enabled: boolean;
  auditLogDays: number;
  workspaceDays: number;
  accessRequestDays: number;
  idleStopEnabled: boolean;
  idleTimeoutMinutes: number;
  batchSize: number;
}

interface DryRunResult {
  expiredUserSessions: number;
  auditLogs: number;
  terminalWorkspaces: number;
  terminalAccessRequests: number;
  total: number;
}

interface AdminRetentionPageProps {
  username: string;
  isAdmin: boolean;
  settings: RetentionSettings;
  dryRun: DryRunResult | null;
  message: string | null;
}

export function AdminRetentionPage({
  username,
  isAdmin,
  settings,
  dryRun,
  message,
}: AdminRetentionPageProps) {
  return (
    <Layout title="Retention Settings - RPL GPU Platform" username={username} isAdmin={isAdmin}>
      <h1>Retention settings</h1>

      {message && <p>{message}</p>}

      <form className="plain-form" method="post" action="/admin/retention/save">
        <label className="label-check">
          <input type="checkbox" name="enabled" defaultChecked={settings.enabled} />
          Retention enabled
        </label>
        <div>
          <label>
            Audit log retention days{' '}
            <input
              type="number"
              name="auditLogDays"
              min="7"
              max="3650"
              defaultValue={settings.auditLogDays}
              required
            />
          </label>
        </div>
        <div>
          <label>
            Workspace history retention days{' '}
            <input
              type="number"
              name="workspaceDays"
              min="7"
              max="3650"
              defaultValue={settings.workspaceDays}
              required
            />
          </label>
        </div>
        <div>
          <label>
            Access request history retention days{' '}
            <input
              type="number"
              name="accessRequestDays"
              min="7"
              max="3650"
              defaultValue={settings.accessRequestDays}
              required
            />
          </label>
        </div>
        <label className="label-check">
          <input type="checkbox" name="idleStopEnabled" defaultChecked={settings.idleStopEnabled} />
          Stop idle workspaces automatically
        </label>
        <div>
          <label>
            Idle timeout minutes{' '}
            <input
              type="number"
              name="idleTimeoutMinutes"
              min="5"
              max="1440"
              defaultValue={settings.idleTimeoutMinutes}
              required
            />
          </label>
          <small>
            Workspace traffic through Jupyter keeps this timer fresh. If no activity is seen for
            this long, the platform stops the workspace.
          </small>
        </div>
        <div>
          <label>
            Batch size{' '}
            <input
              type="number"
              name="batchSize"
              min="10"
              max="10000"
              defaultValue={settings.batchSize}
              required
            />
          </label>
        </div>
        <button type="submit" className="btn btn-primary">
          Save settings
        </button>
      </form>

      <form
        className="btn-row back-action"
        method="post"
        action="/admin/retention/dry-run"
      >
        <input type="hidden" name="enabled" value={settings.enabled ? 'true' : 'false'} />
        <input type="hidden" name="auditLogDays" value={String(settings.auditLogDays)} />
        <input type="hidden" name="workspaceDays" value={String(settings.workspaceDays)} />
        <input type="hidden" name="accessRequestDays" value={String(settings.accessRequestDays)} />
        <input
          type="hidden"
          name="idleStopEnabled"
          value={settings.idleStopEnabled ? 'true' : 'false'}
        />
        <input
          type="hidden"
          name="idleTimeoutMinutes"
          value={String(settings.idleTimeoutMinutes)}
        />
        <input type="hidden" name="batchSize" value={String(settings.batchSize)} />
        <button type="submit" className="btn btn-ghost">
          Dry run cleanup
        </button>
      </form>

      {dryRun && (
        <>
          <h2>Dry run result</h2>
          <table className="table">
            <tbody>
              <tr>
                <th>Data</th>
                <th>Rows eligible</th>
              </tr>
              <tr>
                <td>Expired browser sessions</td>
                <td>{dryRun.expiredUserSessions}</td>
              </tr>
              <tr>
                <td>Audit logs</td>
                <td>{dryRun.auditLogs}</td>
              </tr>
              <tr>
                <td>Terminal workspaces</td>
                <td>{dryRun.terminalWorkspaces}</td>
              </tr>
              <tr>
                <td>Terminal access requests without workspace rows</td>
                <td>{dryRun.terminalAccessRequests}</td>
              </tr>
              <tr>
                <th>Total</th>
                <th>{dryRun.total}</th>
              </tr>
            </tbody>
          </table>
        </>
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
