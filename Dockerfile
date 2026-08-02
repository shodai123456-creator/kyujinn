FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY app ./app
COPY server.mjs ./
RUN mkdir /data && chown node:node /data
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV DATA_DIR=/data
USER node
EXPOSE 4173
CMD ["node", "server.mjs"]
