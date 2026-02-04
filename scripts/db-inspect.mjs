import "dotenv/config";
import pg from "pg";

const { Client } = pg;

const DEFAULT_TABLES = [
  "properties",
  "property_images",
  "property_categories",
  "cities",
  "room_types",
];

const argv = process.argv.slice(2);
const tables = [];
const samples = [];
let columnsOnly = false;
let showTypes = false;
let showUdt = false;
let showDefaults = false;

const usage = `Usage: node scripts/db-inspect.mjs [options]

Options:
  -t, --table <name>         Add a table (repeatable)
  --tables <a,b,c>           Add a comma-separated table list
  --columns-only             Print only column names (comma-separated)
  --types                    Include data_type (default if no include flags)
  --udt                      Include udt_name
  --defaults                 Include column_default
  --sample <table[:column]>  Print a single value (default column=id)
  --help                     Show this help

Examples:
  node scripts/db-inspect.mjs --table accounts --types
  node scripts/db-inspect.mjs --tables property_categories --udt --defaults
  node scripts/db-inspect.mjs --table accounts --sample accounts:id
`;

function die(message) {
  if (message) console.error(message);
  console.error(usage);
  process.exit(1);
}

function isSafeIdentifier(value) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (arg === "--help" || arg === "-h") {
    console.log(usage);
    process.exit(0);
  }
  if (arg === "--table" || arg === "-t") {
    const next = argv[i + 1];
    if (!next) die("Missing value for --table");
    tables.push(next);
    i += 1;
    continue;
  }
  if (arg === "--tables") {
    const next = argv[i + 1];
    if (!next) die("Missing value for --tables");
    for (const name of next.split(",")) {
      const trimmed = name.trim();
      if (trimmed) tables.push(trimmed);
    }
    i += 1;
    continue;
  }
  if (arg === "--columns-only") {
    columnsOnly = true;
    continue;
  }
  if (arg === "--types") {
    showTypes = true;
    continue;
  }
  if (arg === "--udt") {
    showUdt = true;
    continue;
  }
  if (arg === "--defaults") {
    showDefaults = true;
    continue;
  }
  if (arg === "--sample") {
    const next = argv[i + 1];
    if (!next) die("Missing value for --sample");
    samples.push(next);
    i += 1;
    continue;
  }
  die(`Unknown option: ${arg}`);
}

if (!showTypes && !showUdt && !showDefaults && !columnsOnly) {
  showTypes = true;
}

const tableList = tables.length > 0 ? tables : DEFAULT_TABLES;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const client = new Client({ connectionString: databaseUrl });

await client.connect();

const selectColumns = ["column_name"];
if (!columnsOnly) {
  if (showTypes) selectColumns.push("data_type");
  if (showUdt) selectColumns.push("udt_name");
  if (showDefaults) selectColumns.push("column_default");
}

for (const table of tableList) {
  const res = await client.query(
    `select ${selectColumns.join(", ")} from information_schema.columns where table_name=$1 order by ordinal_position`,
    [table],
  );
  console.log(`\n${table}`);
  if (columnsOnly) {
    console.log(res.rows.map((row) => row.column_name).join(","));
  } else {
    console.log(res.rows);
  }
}

for (const spec of samples) {
  const [table, column = "id"] = spec.split(":");
  if (!table) die(`Invalid --sample value: ${spec}`);
  if (!isSafeIdentifier(table) || !isSafeIdentifier(column)) {
    die(`Unsafe identifier in --sample: ${spec}`);
  }
  const res = await client.query(`select ${column} from ${table} limit 1`);
  console.log(`\n${table} sample (${column})`);
  if (res.rows.length === 0) {
    console.log("<no rows>");
  } else {
    console.log(res.rows[0]);
  }
}

await client.end();
