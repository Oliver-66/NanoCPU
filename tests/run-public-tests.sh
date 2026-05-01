#!/bin/sh

set -eu

supports_node_test_runner() {
  "$1" --help 2>&1 | grep -q -- '--test'
}

if command -v node >/dev/null 2>&1 && supports_node_test_runner node; then
  exec node --test "$@"
fi

nvm_root="${HOME:-}/.nvm/versions/node"

if [ -n "${HOME:-}" ] && [ -d "$nvm_root" ]; then
  for candidate in "$nvm_root"/*/bin/node; do
    if [ -x "$candidate" ] && supports_node_test_runner "$candidate"; then
      exec "$candidate" --test "$@"
    fi
  done
fi

echo "Unable to find a Node.js runtime with --test support. Tried 'node' from PATH and \$HOME/.nvm/versions/node/*/bin/node." >&2
exit 1
