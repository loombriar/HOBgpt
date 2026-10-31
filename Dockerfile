# Use the Amazon ECR Public mirror rather than Docker Hub to avoid anonymous pull limits.
FROM public.ecr.aws/docker/library/node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY apps/default/package*.json apps/default/
RUN npm --prefix apps/default ci --include=dev
COPY . .
# Limit parallel backend test workers to reduce memory pressure during Railway builds.
# Run focused payout guards during image build; full backend suite must run separately in CI.
# The full suite currently stalls during Railway image builds and exceeds the build limit.
RUN node --test --test-concurrency=1 tests/payout-safety-regression.test.js tests/payout-transfer-integration.test.js tests/passkeys.test.js tests/passkeys-android.test.js tests/admin-mfa.test.js
RUN npm --prefix apps/default test
RUN npm --prefix apps/default run build
RUN npm prune --omit=dev

FROM public.ecr.aws/docker/library/node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends gosu && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app /app
# Retain the compiled storefront, not its build-time dependency tree or test fixtures.
# The server serves apps/default/dist; frontend node_modules are build-only.
RUN test -d /app/apps/default/dist \
 && rm -rf /app/apps/default/node_modules \
    /app/apps/default/src /app/apps/default/scripts \
    /app/apps/default/test /app/apps/default/tests \
    /app/tests /app/e2e /app/docs /app/.github /app/.git \
    /app/playwright.config.js /app/playwright.config.ts
# Run the HTTP process without root privileges. Persistent data must be writable by UID 1000.
COPY --chown=root:root docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod 755 /usr/local/bin/docker-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
# Launch the authenticated ingress directly; ENTRYPOINT drops to UID 1000.
CMD ["node","scripts/start-ingress.js"]
