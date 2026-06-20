import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GrantsIndexPage } from '@/views/grants/GrantsIndexPage';
import { NewGrantPage } from '@/views/grants/NewGrantPage';

const approvedGrant = {
  id: 'grant-1',
  createdAt: '2026-06-17',
  gpuTarget: 'auto',
  requestedCpu: 2,
  requestedMemoryGb: 4,
  purpose: null,
  status: 'approved',
  decisionReason: null,
};

describe('GrantsIndexPage', () => {
  it('does not offer request changes while an approved grant has a live workspace', () => {
    const html = renderToStaticMarkup(
      <GrantsIndexPage
        username="student"
        isAdmin={false}
        grants={{ items: [approvedGrant], page: 1, pageCount: 1, total: 1 }}
        liveAccess={approvedGrant}
        hasLiveWorkspace={true}
        message={null}
      />,
    );

    expect(html).not.toContain('Request change');
    expect(html).not.toContain('Start session');
    expect(html).toContain('Session running');
    expect(html).toContain('Stop your active workspace before requesting access changes.');
  });

  it('offers request changes for an approved grant without a live workspace', () => {
    const html = renderToStaticMarkup(
      <GrantsIndexPage
        username="student"
        isAdmin={false}
        grants={{ items: [approvedGrant], page: 1, pageCount: 1, total: 1 }}
        liveAccess={approvedGrant}
        hasLiveWorkspace={false}
        message={null}
      />,
    );

    expect(html).toContain('Request change');
  });
});

describe('NewGrantPage', () => {
  it('blocks the direct request form when a request is already pending', () => {
    const html = renderToStaticMarkup(
      <NewGrantPage
        username="student"
        isAdmin={false}
        environments={[]}
        gpuTargets={[]}
        settings={{ maxRequestCpu: 0, maxRequestMemoryGb: 0 }}
        isChangeRequest={false}
        hasLiveWorkspace={false}
        hasPendingRequest={true}
      />,
    );

    expect(html).toContain('Access request already pending.');
    expect(html).not.toContain('action=&quot;/grants&quot;');
  });
});
