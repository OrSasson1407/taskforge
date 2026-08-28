FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/orchestrator/package*.json ./packages/orchestrator/
COPY packages/worker/package*.json ./packages/worker/
COPY packages/dashboard/package*.json ./packages/dashboard/
RUN npm ci --workspace=packages/worker --workspace=packages/shared
COPY packages/shared ./packages/shared
COPY packages/worker ./packages/worker
WORKDIR /app/packages/worker
CMD ["npm", "start"]
