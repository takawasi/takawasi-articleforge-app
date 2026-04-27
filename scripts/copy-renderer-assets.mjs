import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const rendererDist = join(root, 'dist', 'renderer');

mkdirSync(rendererDist, { recursive: true });

for (const [from, to] of [
  [join(root, 'src', 'renderer', 'index.html'), join(rendererDist, 'index.html')],
  [join(root, 'src', 'renderer', 'styles.css'), join(rendererDist, 'styles.css')],
  [join(root, 'node_modules', 'xterm', 'css', 'xterm.css'), join(rendererDist, 'xterm.css')],
  [join(root, 'node_modules', 'dockview-core', 'dist', 'styles', 'dockview.css'), join(rendererDist, 'dockview.css')],
]) {
  copyFileSync(from, to);
}
