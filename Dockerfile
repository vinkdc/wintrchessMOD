FROM node:22-alpine

WORKDIR /app

# Install dependencies from the manifests alone, so this layer is reused
# by every deployment that does not change a package.json
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci

COPY . .

# Values baked into the client bundle at build time. Declared after the
# install so that NODE_ENV does not skip development dependencies.
ARG NODE_ENV=production
ARG ADS_PUBLISHER_ID
ARG ANALYTICS_MEASUREMENT_ID
ARG EMAIL_ACCOUNT
ARG GOOGLE_OAUTH_CLIENT_ID

# Build everything into the image so a new deployment only has to start
# the server. The webpack cache persists between builds, so only changed
# modules are recompiled.
RUN --mount=type=cache,target=/app/client/node_modules/.cache \
    npm run build

EXPOSE 8080

CMD ["npm", "start"]
