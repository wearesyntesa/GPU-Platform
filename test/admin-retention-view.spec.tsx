import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AdminRetentionPage } from '@/views/admin/AdminRetentionPage';

const settings = {
  enabled: true,
  auditLogDays: 90,
  workspaceDays: 90,
  accessRequestDays: 90,
  idleStopEnabled: true,
  idleTimeoutMinutes: 30,
  batchSize: 500,
};

describe('AdminRetentionPage', () => {
  it('places dry-run and save actions in one shared row', () => {
    const html = renderToStaticMarkup(
      <AdminRetentionPage
        fullName="Admin"
        isAdmin
        settings={settings}
        dryRun={null}
        message={null}
      />,
    );

    expect(html).toContain('id="retention-settings-form"');
    expect(html).toContain('class="btn-row back-action"');
    expect(html.indexOf('Dry run cleanup')).toBeLessThan(html.indexOf('Save settings'));
    expect(html).toContain('formAction="/admin/retention/dry-run"');
    expect(html).toContain('form="retention-settings-form"');
  });
});
