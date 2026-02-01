import "dotenv/config";
import pg from "pg";

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

const tables = [
  "properties",
  "property_images",
  "property_categories",
  "cities",
  "room_types",
];

await client.connect();
for (const table of tables) {
  const res = await client.query(
    "select column_name,data_type from information_schema.columns where table_name=$1 order by ordinal_position",
    [table],
  );
  console.log(`\n${table}`);
  console.log(res.rows);
}
await client.end();
