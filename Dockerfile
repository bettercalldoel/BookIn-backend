FROM node:slim

RUN apt-get update -y \
    && apt-get install -y openssl

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

# Prisma generate during build requires a datasource URL.
# Railway runtime variables will override these values in production.
ARG DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres"
ARG DIRECT_URL="postgresql://postgres:postgres@localhost:5432/postgres"
ENV DATABASE_URL=${DATABASE_URL}
ENV DIRECT_URL=${DIRECT_URL}

RUN npm run build

EXPOSE 8000

CMD ["sh", "-c", "npm run db:deploy && npm run start"]
