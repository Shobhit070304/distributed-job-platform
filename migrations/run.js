const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Load .env from the project root (parent directory of the migrations folder)
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// UPDATE THIS VARIABLE WITH THE MIGRATION FILE YOU WANT TO RUN
const MIGRATION_FILE = '002_add_retry_columns.sql';

async function runMigration() {
    const filePath = path.join(__dirname, MIGRATION_FILE);

    if (!fs.existsSync(filePath)) {
        console.error(`❌ Error: Migration file not found at: ${filePath}`);
        process.exit(1);
    }

    console.log(`📖 Reading migration file: ${MIGRATION_FILE}...`);
    const sql = fs.readFileSync(filePath, 'utf8');

    if (!process.env.DATABASE_URL) {
        console.error('❌ Error: DATABASE_URL is not defined in the environment variables.');
        process.exit(1);
    }

    const client = new Client({
        connectionString: process.env.DATABASE_URL,
    });

    try {
        await client.connect();
        console.log('🔌 Connected to the database. Running SQL queries...');

        await client.query(sql);

        console.log('✅ Migration completed successfully!');
    } catch (err) {
        console.error('❌ Migration failed with error:', err.message);
        console.error(err);
        process.exit(1);
    } finally {
        await client.end();
        console.log('🔌 Connection closed.');
    }
}

runMigration();
