FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/worker/package*.json ./packages/worker/
RUN npm ci --workspace=packages/worker --workspace=packages/shared
COPY packages/shared ./packages/shared
COPY packages/worker ./packages/worker
WORKDIR /app/packages/worker
CMD ["npm", "start"]
