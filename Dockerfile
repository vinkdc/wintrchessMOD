FROM node:22-alpine

WORKDIR /app
COPY . .

RUN npm ci

# Values baked into the client bundle at build time. Declared after the
# install so that NODE_ENV does not skip development dependencies.
ARG NODE_ENV=production
ARG ADS_PUBLISHER_ID
ARG ANALYTICS_MEASUREMENT_ID
ARG EMAIL_ACCOUNT

# Build everything into the image so a new deployment only has to start
# the server, rather than building the client after the old one stops
RUN npm run build

EXPOSE 8080

CMD ["npm", "start"]
