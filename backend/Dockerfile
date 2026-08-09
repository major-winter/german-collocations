FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
RUN npm ci --workspace=backend
COPY tsconfig.base.json ./
COPY backend/ backend/
WORKDIR /app/backend
CMD ["node", "--env-file-if-exists=.env", "src/index.ts"]
