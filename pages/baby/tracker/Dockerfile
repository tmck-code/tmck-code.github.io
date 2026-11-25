# syntax=docker/dockerfile:1

# Builder: pinned uv image, managed Python, deps only. App code is not present
# here, so editing it never invalidates the `uv sync` layer.
FROM ghcr.io/astral-sh/uv:0.9-trixie-slim AS uv-builder

ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
ENV UV_PYTHON_INSTALL_DIR=/python
ENV UV_PYTHON_PREFERENCE=only-managed
RUN uv python install 3.14
WORKDIR /app

RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --locked --no-dev

# Runtime base: clean debian, runtime libs only (tzdata backs zoneinfo for /api/daily).
FROM debian:trixie-slim AS os-builder
RUN rm -f /etc/apt/apt.conf.d/docker-clean
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends tzdata \
    && rm -rf /tmp/* /var/tmp/*

FROM os-builder AS app
WORKDIR /app
RUN groupadd --system --gid 999 appuser \
    && useradd --system --gid 999 --uid 999 --create-home appuser \
    && mkdir /data && chown 999:999 /data

COPY --link --from=uv-builder --chown=999:999 /app/.venv /app/.venv
COPY --link --from=uv-builder --chown=999:999 /python /python
COPY --chown=999:999 ./babytracker /app/babytracker
COPY --chown=999:999 ./static /app/static

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    BABY_DB_PATH=/data/baby.duckdb
EXPOSE 8000
USER 999

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=2)"]

# One process, one worker: DuckDB allows a single writer.
CMD ["uvicorn", "babytracker.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
