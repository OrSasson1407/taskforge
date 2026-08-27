FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/orchestrator/package*.json ./packages/orchestrator/
RUN npm ci --workspace=packages/orchestrator --workspace=packages/shared
COPY packages/shared ./packages/shared
COPY packages/orchestrator ./packages/orchestrator
WORKDIR /app/packages/orchestrator
CMD ["npm", "start"]
