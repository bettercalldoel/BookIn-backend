const fs = require("fs");
const { Client } = require("pg");
const content = fs.readFileSync(".env", "utf8");
const env = {};
for (const line of content.split(/\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i === -1) continue;
  const k = t.slice(0, i).trim();
  let v = t.slice(i + 1).trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  env[k] = v;
}
const client = new Client({ connectionString: env.DATABASE_URL });
client
  .connect()
  .then(async () => {
    const res = await client.query(
      "select column_name, data_type, udt_name from information_schema.columns where table_name='property_images' order by ordinal_position",
    );
    console.log(res.rows);
  })
  .catch((err) => console.error(err.message))
  .finally(() => client.end());
