# Express.js + Prisma API Server

This project is a robust boilerplate for building REST APIs using Express.js, TypeScript, and the Prisma ORM. It's designed to provide a solid foundation with essential features like environment management, request validation, Docker support, and a structured setup for modern backend development.

## Features

- **Framework**: [Express.js](https://expressjs.com/) for building the web server and APIs.
- **Language**: [TypeScript](https://www.typescriptlang.org/) for static typing and a better development experience.
- **ORM**: [Prisma](https://www.prisma.io/) for intuitive, type-safe database access with PostgreSQL adapter.
- **Validation**: [class-validator](https://github.com/typestack/class-validator) and [class-transformer](https://github.com/typestack/class-transformer) for validating and transforming incoming request bodies.
- **Environment Variables**: [dotenv](https://github.com/motdotla/dotenv) to load environment variables from a `.env` file.
- **CORS**: Pre-configured CORS support.
- **Docker**: Ready-to-use Docker configurations for both development and production environments.
- **Code Quality**: Pre-configured Prettier for code formatting and Husky for Git hooks.
- **Conventional Commits**: Enforced commit message standards using Commitlint.

## Getting Started

Follow these steps to get the project up and running on your local machine.

### 1. Clone the Repository

```bash
git clone https://github.com/danielreinhard1129/express-finpro-boilerplate
cd express-finpro-boilerplate
```

### 2. Install Dependencies

Install all the required project dependencies using npm.

```bash
npm install
```

This will also set up Husky Git hooks automatically via the `prepare` script.

### 3. Set Up Environment Variables

This project uses two different environment configurations:

#### For Local Development

Create a `.env` file in the root of the project for local development:

```bash
cp .env.example .env
```

Or create it manually with the following content:

```env
# APP
PORT=8000

# DB
DATABASE_URL="postgresql://postgres:admin@localhost:6543/postgres"
```

**Note**: The local database runs on port `6543` to avoid conflicts with other PostgreSQL instances.

#### For Production (Docker)

Create a `.env.prod` file for production deployment:

```bash
cp .env.prod.example .env.prod
```

Or create it manually with the following content:

```env
# APP
NODE_ENV=production
PORT=8000

# DB
POSTGRES_LOCAL_PASSWORD=yourpass
DATABASE_URL="postgresql://postgres:yourpass@postgres:5432/postgres"
```

**Important**:

- Replace `yourpass` with a strong, secure password
- The production environment uses `postgres` as the hostname (Docker service name)
- The production database runs on the default PostgreSQL port `5432` inside the Docker network
- If you change `POSTGRES_LOCAL_PASSWORD` after the DB was created, clear old data first (`npm run docker-prod:down` then remove `docker/prod/postgres`).

### 4. Set Up the Database

#### Local Development

Run the Prisma migration command to create the database schema based on your `prisma/schema.prisma` file.

```bash
npx prisma migrate dev
```

If you prefer to only generate the client without running migrations, use:

```bash
npx prisma generate
```

#### Production (Docker)

Database migrations will run automatically when you start the Docker production environment, or you can run them manually:

```bash
npm run db:deploy
```

## Running the Application

### Development Mode (Local)

Run the application in development mode with hot-reload:

```bash
npm run dev
```

The server will start on `http://localhost:8000` (or the port specified in your `.env` file).

If your `.env` points to a remote database (for example Railway Postgres), use this command to force local Docker Postgres:

```bash
npm run dev:local-db
```

### Production Mode (Local Build)

Build the TypeScript project and start the server:

```bash
npm run build
npm run start
```

## Deploy to Railway

This setup keeps deployment simple for this codebase:

- Backend runtime: Railway
- Database: Railway Postgres (or external Postgres with SSL)
- Frontend: Vercel

### 1. Create Railway Project and Service

In Railway dashboard:

1. Create a project.
2. Add a Postgres service.
3. Add a backend service connected to this repo (`BookIn-backend`).

### 2. Set Backend Variables in Railway

Set these variables on the backend service:

- `NODE_ENV=production`
- `PORT=8000`
- `CORS_ALLOWED_ORIGINS=https://your-frontend.vercel.app,*.vercel.app`
- `APP_BASE_URL=https://your-frontend.vercel.app`
- `JWT_SECRET=<strong-random-secret>`
- `JWT_EXPIRES_IN=1h`
- `EMAIL_VERIFICATION_TTL_MINUTES=60`
- `PASSWORD_RESET_TTL_MINUTES=60`
- `DATABASE_URL=<postgres-connection-string-with-sslmode=require>`
- `DIRECT_URL=<postgres-connection-string-with-sslmode=require>`

Optional service integrations (set only if used):

- `GOOGLE_CLIENT_ID`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE`
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_UPLOAD_FOLDER`
- `XENDIT_SECRET_KEY`, `XENDIT_CALLBACK_TOKEN`, `XENDIT_API_BASE_URL`, `XENDIT_INVOICE_EXPIRY_MINUTES`
- `BOOKING_PAYMENT_DUE_MINUTES`, `BOOKING_PROOF_UPLOAD_DUE_MINUTES`

### 3. Deploy Backend via Railway CLI (Optional but Fast)

Install CLI:

```bash
npm i -g @railway/cli
```

Authenticate once:

```bash
railway login
```

Run deployment helper:

```bash
export RAILWAY_PROJECT_ID=<project-id> # optional if folder already linked
export RAILWAY_SERVICE_NAME=api
export RAILWAY_ENVIRONMENT=production
export DATABASE_URL='postgresql://...'
export DIRECT_URL='postgresql://...'
export APP_BASE_URL='https://your-frontend.vercel.app'
export JWT_SECRET='your-strong-secret'
./scripts/deploy-railway.sh
```

The helper will:

- link/create project and service
- set required environment variables
- trigger `railway up`
- print deployment status and domain information

### 4. Point Vercel Frontend to Railway API

In Vercel project environment variables:

- `NEXT_PUBLIC_API_BASE_URL=https://<your-railway-backend-domain>`
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID=<your-google-client-id>` (optional)

Then redeploy frontend so the public env vars are baked into the build.

## Docker Support

This project includes Docker configurations for both development and production environments.

### Development with Docker

Start the development environment (uses `.env` file):

```bash
npm run docker-dev:up
```

Stop the development environment:

```bash
npm run docker-dev:down
```

### Production with Docker

Start the production environment (uses `.env.prod` file):

```bash
npm run docker-prod:up
```

View production logs:

```bash
npm run docker-prod:logs
```

Stop the production environment:

```bash
npm run docker-prod:down
```

### Database Deployment

Deploy database migrations and generate Prisma Client (useful for CI/CD):

```bash
npm run db:deploy
```

## Code Quality

### Formatting

This project uses Prettier for code formatting. All code is automatically formatted on commit via Husky and lint-staged.

Format all files manually:

```bash
npm run format
```

Check formatting without making changes:

```bash
npm run format:check
```

### Conventional Commits

This project enforces [Conventional Commits](https://www.conventionalcommits.org/) using Commitlint and Husky. All commit messages must follow this format:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

#### Commit Types

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Changes that don't affect code meaning (formatting, white-space, etc.)
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `perf`: Code change that improves performance
- `test`: Adding missing tests or correcting existing tests
- `build`: Changes that affect the build system or external dependencies
- `ci`: Changes to CI configuration files and scripts
- `chore`: Other changes that don't modify src or test files

#### Example Commits

```bash
git commit -m "feat: add user authentication endpoint"
git commit -m "fix: resolve database connection timeout"
git commit -m "docs: update README with Docker instructions"
git commit -m "refactor: simplify validation middleware"
```

If your commit message doesn't follow the conventional format, the commit will be rejected by Husky's commit-msg hook.

## Testing

### Unit Test

Jalankan test non-integration (tidak butuh database):

```bash
npm test
```

### Integration Test (Real DB)

Integration test akan menulis dan menghapus data test di database, jadi jalankan pada environment development.

Prasyarat:

```bash
npm run docker-dev:up
```

Jalankan integration test:

```bash
npm run test:integration
```

Catatan:

- Integration test membaca `DATABASE_URL` (contoh lokal: `postgresql://postgres:admin@localhost:6543/postgres`)
- Data test menggunakan prefix unik dan dibersihkan setelah test selesai.

### Sinkronisasi Data Remote -> Local Dev

Kalau data di Prisma Studio (remote) berbeda dengan data saat backend lokal berjalan, sinkronkan dulu ke DB Docker dev:

```bash
npm run docker-dev:up
npm run db:sync:dev
```

## Available Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm test` - Run non-integration tests
- `npm run test:integration` - Run integration tests against real database
- `npm run start` - Start the production server
- `npm run dev` - Start the development server with hot-reload
- `npm run dev:local-db` - Start dev server forced to local Docker PostgreSQL (`localhost:6543`)
- `npm run db:deploy` - Run Prisma migrations and generate client
- `npm run db:sync:dev` - Sync data from remote DB (`.env.prod`) to local dev container (`postgres_container_dev`)
- `npm run docker-dev:up` - Start Docker development environment
- `npm run docker-dev:down` - Stop Docker development environment
- `npm run docker-prod:up` - Build and start Docker production environment
- `npm run docker-prod:down` - Stop Docker production environment
- `npm run docker-prod:logs` - View Docker production logs
- `npm run format` - Format all files with Prettier
- `npm run format:check` - Check formatting without making changes

## Environment Variables Explained

### Local Development (`.env`)

- Uses `localhost:6543` to connect to the database
- Suitable for local development without Docker
- Port `6543` avoids conflicts with system PostgreSQL installations

### Production (`.env.prod`)

- Uses `postgres:5432` as the database host (Docker service name)
- Requires `POSTGRES_LOCAL_PASSWORD` for the PostgreSQL container
- Used by `docker-compose.prod.yml`
- Runs on default PostgreSQL port inside Docker network
- In `docker-compose.prod.yml`, app DB URL is built from `POSTGRES_LOCAL_PASSWORD` to avoid conflict with other `DATABASE_URL` values.

## Xendit Payment Gateway Setup

Tambahkan environment variable berikut di backend:

```env
XENDIT_SECRET_KEY=your_xendit_secret_key
XENDIT_CALLBACK_TOKEN=your_xendit_callback_token
XENDIT_API_BASE_URL=https://api.xendit.co
XENDIT_INVOICE_EXPIRY_MINUTES=30
```

Konfigurasikan webhook URL di dashboard Xendit ke endpoint:

`POST /bookings/payment-gateway/xendit/webhook`

## Tenant Sales Report API

Endpoint:

`GET /bookings/tenant/reports/sales`

Autentikasi:

- Wajib login tenant (`Authorization: Bearer <token>`)

Query parameters:

- `view`: `transaction | property | user` (default: `transaction`)
- `sortBy`: `date | total` (default: `date`)
- `sortOrder`: `asc | desc` (default: `desc`)
- `startDate`: `YYYY-MM-DD` (opsional)
- `endDate`: `YYYY-MM-DD` (opsional)
- `keyword`: string (opsional)
- `page`: integer >= 1 (default: `1`)
- `limit`: integer >= 1 (max: `100`, default: `10`)

Contoh request:

```bash
GET /bookings/tenant/reports/sales?view=property&sortBy=total&sortOrder=desc&startDate=2026-01-01&endDate=2026-01-31&page=1&limit=10
```

Contoh response ringkas:

```json
{
  "data": [
    {
      "propertyId": "7f2f6d15-2e32-4b79-95aa-09f9fcbf9f5c",
      "propertyName": "Villa Merapi",
      "transactions": 12,
      "users": 8,
      "totalSales": 12800000,
      "latestTransactionAt": "2026-01-31T14:22:10.000Z"
    }
  ],
  "summary": {
    "totalSales": 25600000,
    "totalTransactions": 27,
    "avgPerTransaction": 948148
  },
  "trend": [
    { "month": "Aug 25", "sales": 0, "bookings": 0 },
    { "month": "Sep 25", "sales": 0, "bookings": 0 },
    { "month": "Oct 25", "sales": 1200000, "bookings": 2 },
    { "month": "Nov 25", "sales": 2800000, "bookings": 4 },
    { "month": "Dec 25", "sales": 4200000, "bookings": 6 },
    { "month": "Jan 26", "sales": 17400000, "bookings": 15 },
    { "month": "Feb 26", "sales": 0, "bookings": 0 }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 5,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false,
    "view": "property",
    "sortBy": "total",
    "sortOrder": "desc",
    "startDate": "2026-01-01",
    "endDate": "2026-01-31",
    "keyword": null
  }
}
```

Catatan:

- Data sales hanya menghitung booking dengan pembayaran terkonfirmasi:
  - `MANUAL_TRANSFER` + payment proof `APPROVED`
  - `XENDIT` dengan `xenditInvoiceStatus = PAID` atau `paymentConfirmedAt` terisi
- Booking `DIBATALKAN` tetap bisa muncul sebagai transaksi, tapi tidak dihitung ke revenue.

## Security Notes

⚠️ **Important Security Practices:**

1. Never commit `.env` or `.env.prod` files to version control
2. Use strong passwords for production databases
3. Use different credentials for development and production
