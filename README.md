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
POSTGRES_PASSWORD=yourpass
DATABASE_URL="postgresql://postgres:yourpass@postgres:5432/postgres"
```

**Important**:

- Replace `yourpass` with a strong, secure password
- The production environment uses `postgres` as the hostname (Docker service name)
- The production database runs on the default PostgreSQL port `5432` inside the Docker network

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

### Production Mode (Local Build)

Build the TypeScript project and start the server:

```bash
npm run build
npm run start
```

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

## Available Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm run start` - Start the production server
- `npm run dev` - Start the development server with hot-reload
- `npm run db:deploy` - Run Prisma migrations and generate client
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
- Requires `POSTGRES_PASSWORD` for the PostgreSQL container
- Used by `docker-compose.prod.yml`
- Runs on default PostgreSQL port inside Docker network

## Security Notes

⚠️ **Important Security Practices:**

1. Never commit `.env` or `.env.prod` files to version control
2. Use strong passwords for production databases
3. Use different credentials for development and production
