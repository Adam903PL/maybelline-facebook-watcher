# Tag must match the "playwright" version in package.json so the npm package
# finds the browsers preinstalled in the image.
FROM mcr.microsoft.com/playwright:v1.61.1-noble

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

ENV NODE_ENV=production

CMD ["node", "src/index.js"]
