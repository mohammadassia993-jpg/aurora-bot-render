FROM node:22-bookworm-slim

# Install Chrome dependencies and Chromium
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf \
    libxss1 libasound2 libatk-bridge2.0-0 libgtk-3-0 libnss3 libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production PORT=8787
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app
COPY package.json package-lock.json ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts
COPY SOUL.md ./
RUN npm ci && mkdir -p /app/data /app/logs /app/backups /app/deliverables/reports /app/logs

EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","src/index.js"]
