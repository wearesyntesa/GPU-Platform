import { readFileSync, writeFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));

writeFileSync(
  'dist/package.json',
  `${JSON.stringify(
    {
      name: packageJson.name,
      version: packageJson.version,
      private: true,
      _moduleAliases: { '@': 'src' },
    },
    null,
    2,
  )}\n`,
);
