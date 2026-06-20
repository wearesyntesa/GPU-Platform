FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install -y --no-install-recommends git python-is-python3 python3 python3-pip python3-venv \
  && rm -rf /var/lib/apt/lists/* \
  && python3 -m pip install --no-cache-dir \
    black \
    ipywidgets \
    isort \
    jupyter-resource-usage \
    jupyterlab \
    jupyterlab-git \
    jupyterlab-lsp \
    jupyterlab_code_formatter \
    jupyterlab_execute_time \
    matplotlib \
    numpy \
    pandas \
    python-lsp-server \
  && useradd -m -u 1000 jovyan

COPY START_HERE.ipynb /opt/rpl/START_HERE.ipynb
COPY start.sh /usr/local/bin/start-jupyter
RUN chmod 755 /usr/local/bin/start-jupyter

USER jovyan
WORKDIR /work

CMD ["start-jupyter"]
