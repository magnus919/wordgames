FROM rust:1.98-bookworm AS build
WORKDIR /build
COPY backend backend
COPY index.html styles.css ./
COPY js js
RUN cargo build --locked --release --manifest-path backend/Cargo.toml

FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates busybox-static curl && rm -rf /var/lib/apt/lists/* && useradd --uid 10001 --create-home wordgames
WORKDIR /app
COPY --from=build /build/backend/target/release/wordgames /app/wordgames
COPY ops/worker.sh /app/worker.sh
COPY ops/render-crontab.sh /app/render-crontab.sh
RUN chmod 755 /app/worker.sh /app/render-crontab.sh && mkdir -p /etc/crontabs
COPY games /app/games
ENV TZ=UTC GAMES_DIR=/app/games
EXPOSE 8080
USER wordgames
CMD ["/app/wordgames", "serve"]
