FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
COPY SOUL.md ./
ENV NODE_ENV=production PORT=7860
EXPOSE 7860
CMD ["node", "src/index.js"]
