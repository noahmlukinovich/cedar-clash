// Entry point for the bundled server (server-dist/server.mjs).
import { cli } from './main';

cli(process.argv.slice(2)).catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
