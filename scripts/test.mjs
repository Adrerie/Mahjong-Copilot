import { build } from 'esbuild';

const result = await build({
  entryPoints: ['tests/regression.ts'], bundle: true, write: false,
  platform: 'node', format: 'esm', target: 'node18',
});
try {
  await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
