FROM node:24-slim
WORKDIR /app

COPY package.json package-lock.json ./
COPY database/package.json database/ 
RUN npm ci --workspace=database

COPY tsconfig.base.json ./
COPY database/ database/

WORKDIR /app/database
