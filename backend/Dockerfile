FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY src ./src
COPY test ./test
COPY data ./data
USER node
EXPOSE 3000
CMD ["node","src/server.js"]
