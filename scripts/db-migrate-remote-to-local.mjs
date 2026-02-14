import { spawnSync } from "node:child_process";
import {
  closeSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: resolve(process.cwd(), ".env.prod") });

const localContainer =
  process.env.LOCAL_POSTGRES_CONTAINER ?? "bookin_postgres_prod";
const localUser = process.env.LOCAL_POSTGRES_USER ?? "postgres";
const localDb = process.env.LOCAL_POSTGRES_DB ?? "postgres";
const rawRemoteUrl = process.env.DATABASE_URL;

if (!rawRemoteUrl) {
  console.error("DATABASE_URL tidak ditemukan. Pastikan .env.prod tersedia.");
  process.exit(1);
}

const remoteUrl = `${rawRemoteUrl.split("?")[0]}?sslmode=require`;

const compatibleTables = [
  "accounts",
  "booking_nights",
  "bookings",
  "cities",
  "email_verification_tokens",
  "oauth_accounts",
  "password_reset_tokens",
  "payment_proofs",
  "properties",
  "property_categories",
  "property_images",
  "provinces",
  "rate_rules",
  "room_type_calendar",
  "room_types",
  "tenant_profiles",
  "user_profiles",
];

const verifyTablesBase = [...compatibleTables, "reviews"];

const tempDir = mkdtempSync(join(tmpdir(), "bookin-migrate-"));
const commonDumpFile = join(tempDir, "remote-common.dump");
const reviewsCsvFile = join(tempDir, "remote-reviews.csv");
const prismaMigrationsDumpFile = join(tempDir, "remote-prisma-migrations.dump");

const maskSecrets = (text) =>
  text.replace(/:\/\/([^:\s]+):([^@\s]+)@/g, "://$1:***@");

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    ...options,
  });

  if (result.status !== 0) {
    const details = maskSecrets((result.stderr || result.stdout || "").trim());
    throw new Error(details || `Command failed: ${command}`);
  }

  return (result.stdout ?? "").trim();
};

const runToFile = (command, args, targetFile) => {
  const fd = openSync(targetFile, "w");
  try {
    const result = spawnSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", fd, "pipe"],
    });
    if (result.status !== 0) {
      const details = maskSecrets((result.stderr || "").trim());
      throw new Error(details || `Command failed: ${command}`);
    }
  } finally {
    closeSync(fd);
  }
};

const buildCountSql = (tables) =>
  tables
    .map(
      (table, index) =>
        `${index === 0 ? "" : "UNION ALL\n"}SELECT '${table}' AS table_name, COUNT(*)::bigint AS total FROM public.${table}`,
    )
    .join("\n");

const parseCounts = (rawCsv) => {
  const map = new Map();
  const rows = rawCsv
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of rows) {
    const [tableName, totalText] = line.split(",");
    map.set(tableName, Number(totalText));
  }

  return map;
};

const toBool = (value) => String(value).trim().toLowerCase() === "t";

const remoteTableExists = (remoteDbUrl, tableName) => {
  const raw = run("docker", [
    "run",
    "--rm",
    "postgres:18",
    "psql",
    remoteDbUrl,
    "-At",
    "-c",
    `SELECT to_regclass('public.${tableName}') IS NOT NULL;`,
  ]);
  return toBool(raw);
};

const localTableExists = (container, user, db, tableName) => {
  const raw = run("docker", [
    "exec",
    "-i",
    container,
    "psql",
    "-U",
    user,
    "-d",
    db,
    "-At",
    "-c",
    `SELECT to_regclass('public.${tableName}') IS NOT NULL;`,
  ]);
  return toBool(raw);
};

const main = () => {
  let cleanup = true;

  try {
    const running = run("docker", [
      "inspect",
      "-f",
      "{{.State.Running}}",
      localContainer,
    ]);

    if (running !== "true") {
      throw new Error(
        `Container ${localContainer} tidak berjalan. Jalankan docker-prod terlebih dahulu.`,
      );
    }

    console.log("1/7 Dump data kompatibel dari remote...");
    const dumpArgs = [
      "run",
      "--rm",
      "postgres:18",
      "pg_dump",
      remoteUrl,
      "--data-only",
      "--format=custom",
      "--no-owner",
      "--no-privileges",
      "--schema=public",
      ...compatibleTables.map((table) => `--table=public.${table}`),
    ];
    runToFile("docker", dumpArgs, commonDumpFile);

    console.log("2/7 Export reviews dengan mapping kolom...");
    const reviewsQuery = `
COPY (
  SELECT
    id,
    booking_id,
    COALESCE(rating, 1)::integer,
    comment,
    tenant_reply,
    COALESCE(tenant_replied_at, replied_at) AS tenant_replied_at,
    created_at,
    updated_at
  FROM public.reviews
) TO STDOUT WITH CSV
`.trim();
    runToFile(
      "docker",
      [
        "run",
        "--rm",
        "postgres:18",
        "psql",
        remoteUrl,
        "-At",
        "-F",
        ",",
        "-c",
        reviewsQuery,
      ],
      reviewsCsvFile,
    );

    console.log("3/7 Truncate semua tabel public di local...");
    const truncateSql = `
DO $$
DECLARE stmt text;
BEGIN
  SELECT 'TRUNCATE TABLE ' || string_agg(format('%I.%I', schemaname, tablename), ', ') || ' RESTART IDENTITY CASCADE;'
  INTO stmt
  FROM pg_tables
  WHERE schemaname='public';

  IF stmt IS NOT NULL THEN
    EXECUTE stmt;
  END IF;
END $$;
`.trim();
    run("docker", [
      "exec",
      "-i",
      localContainer,
      "psql",
      "-U",
      localUser,
      "-d",
      localDb,
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      truncateSql,
    ]);

    console.log("4/7 Restore data tabel kompatibel ke local...");
    run("docker", [
      "cp",
      commonDumpFile,
      `${localContainer}:/tmp/remote-common.dump`,
    ]);
    run("docker", [
      "exec",
      "-i",
      localContainer,
      "pg_restore",
      "-U",
      localUser,
      "-d",
      localDb,
      "--data-only",
      "--disable-triggers",
      "--no-owner",
      "--no-privileges",
      "--schema=public",
      "/tmp/remote-common.dump",
    ]);

    console.log("5/7 Import data reviews ter-mapping...");
    if (statSync(reviewsCsvFile).size > 0) {
      run(
        "docker",
        [
          "exec",
          "-i",
          localContainer,
          "psql",
          "-U",
          localUser,
          "-d",
          localDb,
          "-v",
          "ON_ERROR_STOP=1",
          "-c",
          "COPY public.reviews (id, booking_id, rating, comment, tenant_reply, tenant_replied_at, created_at, updated_at) FROM STDIN WITH CSV",
        ],
        { input: readFileSync(reviewsCsvFile) },
      );
    }

    const remoteHasPrismaMigrations = remoteTableExists(
      remoteUrl,
      "_prisma_migrations",
    );
    const localHasPrismaMigrations = localTableExists(
      localContainer,
      localUser,
      localDb,
      "_prisma_migrations",
    );
    const shouldSyncPrismaMigrations =
      remoteHasPrismaMigrations && localHasPrismaMigrations;

    if (shouldSyncPrismaMigrations) {
      console.log("6/7 Sinkronkan _prisma_migrations...");
      runToFile(
        "docker",
        [
          "run",
          "--rm",
          "postgres:18",
          "pg_dump",
          remoteUrl,
          "--data-only",
          "--format=custom",
          "--table=public._prisma_migrations",
          "--no-owner",
          "--no-privileges",
        ],
        prismaMigrationsDumpFile,
      );

      run("docker", [
        "exec",
        "-i",
        localContainer,
        "psql",
        "-U",
        localUser,
        "-d",
        localDb,
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        "TRUNCATE TABLE public._prisma_migrations;",
      ]);

      run("docker", [
        "cp",
        prismaMigrationsDumpFile,
        `${localContainer}:/tmp/remote-prisma-migrations.dump`,
      ]);
      run("docker", [
        "exec",
        "-i",
        localContainer,
        "pg_restore",
        "-U",
        localUser,
        "-d",
        localDb,
        "--data-only",
        "--no-owner",
        "--no-privileges",
        "/tmp/remote-prisma-migrations.dump",
      ]);
    } else {
      console.log(
        "6/7 Skip _prisma_migrations sync (table belum ada di local atau remote).",
      );
    }

    console.log("7/7 Validasi jumlah data remote vs local...");
    const verifyTables = shouldSyncPrismaMigrations
      ? [...verifyTablesBase, "_prisma_migrations"]
      : verifyTablesBase;
    const countSql = buildCountSql(verifyTables);
    const remoteCountsRaw = run("docker", [
      "run",
      "--rm",
      "postgres:18",
      "psql",
      remoteUrl,
      "-At",
      "-F",
      ",",
      "-c",
      countSql,
    ]);
    const localCountsRaw = run("docker", [
      "exec",
      "-i",
      localContainer,
      "psql",
      "-U",
      localUser,
      "-d",
      localDb,
      "-At",
      "-F",
      ",",
      "-c",
      countSql,
    ]);

    const remoteCounts = parseCounts(remoteCountsRaw);
    const localCounts = parseCounts(localCountsRaw);

    let mismatch = false;
    for (const table of verifyTables) {
      const remoteCount = remoteCounts.get(table) ?? 0;
      const localCount = localCounts.get(table) ?? 0;
      const status = remoteCount === localCount ? "OK" : "DIFF";
      if (status === "DIFF") mismatch = true;
      console.log(
        `${table}: remote=${remoteCount} local=${localCount} ${status}`,
      );
    }

    if (mismatch) {
      throw new Error("Validasi count menemukan perbedaan data.");
    }

    console.log("Migrasi remote -> local selesai.");
  } catch (error) {
    cleanup = false;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Migrasi gagal: ${message}`);
    console.error(`File sementara disimpan di: ${tempDir}`);
    process.exit(1);
  } finally {
    if (cleanup) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
};

main();
