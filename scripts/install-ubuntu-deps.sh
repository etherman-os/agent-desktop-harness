#!/usr/bin/env bash
set -euo pipefail

include_xterm=1
include_observer=0
print_only=0

usage() {
  cat <<'EOF'
Usage:
  ./scripts/install-ubuntu-deps.sh [--no-xterm] [--with-observer] [--print-only]

Options:
  --no-xterm       Install the harness runtime dependencies without xterm.
  --with-observer  Also install optional live observer dependencies.
  --print-only     Print the apt commands without running them.
  -h, --help       Show this help.
EOF
}

for arg in "$@"; do
  case "$arg" in
    --no-xterm)
      include_xterm=0
      ;;
    --with-observer)
      include_observer=1
      ;;
    --print-only)
      print_only=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      usage >&2
      exit 2
      ;;
  esac
done

packages=(xvfb openbox x11-utils scrot xdotool wmctrl)
if [[ "$include_xterm" == "1" ]]; then
  packages+=(xterm)
fi
if [[ "$include_observer" == "1" ]]; then
  packages+=(x11vnc novnc websockify)
fi

echo "This script will install Ubuntu packages for agent-desktop-harness:"
printf '  %s\n' "${packages[@]}"
echo

if [[ "$print_only" == "1" ]]; then
  echo "sudo apt update"
  echo "sudo apt install -y ${packages[*]}"
  exit 0
fi

if ! command -v sudo >/dev/null 2>&1; then
  echo "sudo was not found. Install these packages manually as an administrator:" >&2
  echo "apt update" >&2
  echo "apt install -y ${packages[*]}" >&2
  exit 1
fi

sudo apt update
sudo apt install -y "${packages[@]}"
