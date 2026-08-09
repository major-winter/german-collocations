FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/
COPY types/package.json types/
COPY types/src/ types/src/
RUN npm ci --workspace=frontend
COPY tsconfig.base.json ./
COPY frontend/ frontend/
WORKDIR /app/frontend
CMD ["npm", "run", "dev", "--", "--host"]
EXPOSE 5173
