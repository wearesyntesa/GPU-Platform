#!/usr/bin/env sh
set -eu

mkdir -p /work
cd /work

if [ ! -e /work/START_HERE.ipynb ]; then
  cp /opt/rpl/START_HERE.ipynb /work/START_HERE.ipynb
fi

mkdir -p /home/jovyan/.jupyter
cat > /home/jovyan/.jupyter/jupyter_server_config.py <<'PY'
import os

c.ResourceUseDisplay.mem_limit = int(os.environ.get('MEM_LIMIT', '0'))
c.ResourceUseDisplay.cpu_limit = float(os.environ.get('CPU_LIMIT', '0'))
c.ResourceUseDisplay.track_cpu_percent = True
c.ResourceUseDisplay.show_host_usage = False
PY

base_url="${JUPYTER_BASE_URL:?}"
default_url="${base_url%/}/lab/tree/START_HERE.ipynb"

exec jupyter lab \
  --ip=0.0.0.0 \
  --port=8888 \
  --no-browser \
  --ServerApp.root_dir=/work \
  --ServerApp.base_url="$base_url" \
  --ServerApp.default_url="$default_url" \
  --LabApp.default_url="$default_url" \
  --ServerApp.token="${JUPYTER_TOKEN:?}" \
  --ServerApp.password="" \
  --ServerApp.allow_origin="*"
