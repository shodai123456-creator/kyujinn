FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY app ./app
COPY server.mjs ./
ENV NODE_ENV=production
ENV HOST=0.0.0.0
EXPOSE 4173
CMD ["node", "server.mjs"]
