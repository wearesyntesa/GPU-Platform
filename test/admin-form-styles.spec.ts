import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('admin form styles', () => {
  it('does not offset buttons nested inside action rows', () => {
    const scss = readFileSync('assets/styles/partials/_components.scss', 'utf8');

    expect(scss).toContain('> button {');
    expect(scss).not.toContain('  button {\n    margin-top: 1rem;\n  }');
  });
});
