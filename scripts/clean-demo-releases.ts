import 'dotenv/config';
import postgres from 'postgres';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is missing');
    return;
  }
  const sql = postgres(url);
  try {
    const res = await sql`
      DELETE FROM releases
      WHERE title IN ('Random Access Memories', 'The Dark Side of the Moon', 'Abbey Road', 'Rumours')
    `;
    console.log(`Deleted ${res.count} demo releases from local DB.`);
  } catch (err) {
    console.error('Cleanup error:', err);
  } finally {
    await sql.end();
  }
}

main();
