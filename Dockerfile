# syntax=docker/dockerfile:1.7
# Pulse as one container: the server, its pages, and a SQLite file under /data.
FROM node:26-slim@sha256:5adad64f9a1fca2d51972caa65983634c8a774eb300d72b20f7f2a0f60368072
# pnpm comes from a lockfile (container/pnpm), so npm checks it against a hash
COPY container/pnpm /opt/pnpm
RUN npm ci --prefix /opt/pnpm && ln -s /opt/pnpm/node_modules/.bin/pnpm /usr/local/bin/pnpm
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts && rm -rf /root/.local/share/pnpm /root/.cache
COPY migrations migrations
COPY src src
RUN mkdir /data && chown node:node /data
# The commit this image was built from, answered by /health
ARG GIT_SHA=
ENV PORT=3000 DATA_DIR=/data NODE_ENV=production GIT_SHA=$GIT_SHA
EXPOSE 3000
VOLUME /data
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node_modules/.bin/tsx", "src/server.ts"]
