FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    NFL_BETS_OUT_DIR=/data/nfl_bets \
    NFL_BETS_PORT=8793 \
    NFL_BETS_BIND=0.0.0.0 \
    NFL_BETS_BANK_START=20 \
    NFL_BETS_INTERVAL_SECONDS=600 \
    TZ=America/New_York

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates tzdata \
    && rm -rf /var/lib/apt/lists/*

COPY nfl_bets /app/nfl_bets
COPY docs /app/docs

VOLUME ["/data"]
EXPOSE 8793

CMD ["sh", "/app/nfl_bets/loop.sh"]
