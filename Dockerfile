# Use the Amazon ECR Public mirror rather than Docker Hub to avoid anonymous pull limits.
FROM public.ecr.aws/docker/library/node:20-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY apps/default/package*.json apps/default/
RUN npm --prefix apps/default ci --include=dev
COPY . .
RUN npm test && npm --prefix apps/default test && npm --prefix apps/default run build
RUN npm prune --omit=dev

FROM public.ecr.aws/docker/library/node:20-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app /app
EXPOSE 3000
CMD ["npm","start"]
