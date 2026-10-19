const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

test('runtime image invokes privilege-dropping entrypoint', () => {
  const docker = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
  const entrypoint = fs.readFileSync(path.join(root, 'docker-entrypoint.sh'), 'utf8');
  assert.match(docker, /ENTRYPOINT \["\/usr\/local\/bin\/docker-entrypoint\.sh"\]/);
  assert.match(docker, /COPY --chown=root:root docker-entrypoint\.sh/);
  assert.match(entrypoint, /chown -R node:node "\$DATA_PATH"/);
  assert.match(entrypoint, /exec gosu node "\$@"/);
  assert.match(entrypoint, /uid!==1000/);
});
