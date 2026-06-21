import { ArrowLeft } from 'lucide-react';
import { Layout } from '@/views/layouts/Layout';

interface AdminSettingsPageProps {
  fullName: string;
  isAdmin: boolean;
  settings: {
    selfRegistrationEnabled: boolean;
    requireInvitation: boolean;
    maxRequestCpu: number;
    maxRequestMemoryGb: number;
  };
  message: string | null;
}

export function AdminSettingsPage({
  fullName,
  isAdmin,
  settings,
  message,
}: AdminSettingsPageProps) {
  return (
    <Layout title="Platform Settings - RPL GPU Platform" fullName={fullName} isAdmin={isAdmin}>
      <h1>Platform settings</h1>

      {message && (
        <div className="notice notice-success">
          <strong>{message}</strong>
        </div>
      )}

      <form className="plain-form" method="post" action="/admin/settings">
        <div>
          <label className="label-check">
            <input
              type="checkbox"
              name="selfRegistrationEnabled"
              defaultChecked={settings.selfRegistrationEnabled}
            />
            Allow self-registration
          </label>
          <small>When enabled, anyone can register at /register without an invitation link.</small>
        </div>
        <div>
          <label className="label-check">
            <input
              type="checkbox"
              name="requireInvitation"
              defaultChecked={settings.requireInvitation}
            />
            Require invitation link
          </label>
          <small>
            When enabled, registration requires a valid invitation link even if self-registration is
            on.
          </small>
        </div>
        <hr />
        <div>
          <label htmlFor="maxRequestCpu">Maximum CPU cores per request</label>
          <input
            id="maxRequestCpu"
            name="maxRequestCpu"
            type="number"
            min="1"
            max="128"
            defaultValue={settings.maxRequestCpu}
            required
          />
          <small>Largest CPU request a user can submit.</small>
        </div>
        <div>
          <label htmlFor="maxRequestMemoryGb">Maximum memory per request (GB)</label>
          <input
            id="maxRequestMemoryGb"
            name="maxRequestMemoryGb"
            type="number"
            min="1"
            max="1024"
            defaultValue={settings.maxRequestMemoryGb}
            required
          />
          <small>Largest RAM request a user can submit.</small>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary">
            Save settings
          </button>
        </div>
      </form>

      <p className="back-action">
        <a href="/admin" className="btn btn-back">
          <ArrowLeft size={16} aria-hidden="true" />
          Back to admin
        </a>
      </p>
    </Layout>
  );
}
