# Self-hosted Mem0 (open source), the agents' long-term memory.
# Same recipe as Capability-Economics-Guide/mem0/Dockerfile: the upstream server, unpatched, pinned,
# with the libpq fix. Its defaults are OpenAI (OPENAI_API_KEY, MEM0_DEFAULT_LLM_MODEL,
# MEM0_DEFAULT_EMBEDDER_MODEL), the same configuration as Doug's other Mem0.
FROM python:3.12-slim

# Pinned so rebuilds are reproducible. The server and the mem0ai library move together.
ARG MEM0_VERSION=2.2.1
ADD https://github.com/mem0ai/mem0/archive/refs/tags/v${MEM0_VERSION}.tar.gz /tmp/mem0.tar.gz
RUN python -c "import tarfile; tarfile.open('/tmp/mem0.tar.gz').extractall('/tmp/src', filter='data')" \
    && mv /tmp/src/mem0-${MEM0_VERSION}/server /app && rm -rf /tmp/src /tmp/mem0.tar.gz
WORKDIR /app
# psycopg[binary] carries its own libpq: the upstream image crashes without one ("no pq wrapper available").
RUN pip install --no-cache-dir -r requirements.txt "mem0ai==${MEM0_VERSION}" "psycopg[binary]>=3.2.8"

# Mem0 keeps a small SQLite history next to pgvector and will not create the folder itself.
RUN mkdir -p /app/history

EXPOSE 8000
ENV PYTHONUNBUFFERED=1 MEM0_TELEMETRY=false
# alembic creates the server's own tables (API keys, request log) before it starts.
CMD ["sh", "-c", "alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port 8000"]
