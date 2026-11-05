
require("dotenv").config();

const { createClient } = require("@libsql/client");

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    throw new Error(
      "Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN in .env"
    );
  }

  const db = createClient({ url, authToken });

  try {
    const result = await db.execute("SELECT 1 AS connected");
    console.log("Turso connection successful:", result.rows[0]);
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error("Turso connection failed:", error.message);
  process.exitCode = 1;
});
