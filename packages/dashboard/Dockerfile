FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/dashboard/package*.json ./packages/dashboard/
RUN npm ci --workspace=packages/dashboard --workspace=packages/shared
COPY packages/shared ./packages/shared
COPY packages/dashboard ./packages/dashboard
WORKDIR /app/packages/dashboard
# Binding to 0.0.0.0 for Docker port forwarding
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
