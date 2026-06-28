const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Load .env from the project root
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function runMigration() {
    const args = process.argv.slice(2);
    const targetFile = args[0];

    if (!targetFile) {
        console.error('❌ Error: No migration file specified.');
        console.log('\nUsage:');
        console.log('  node migrations/run.js <migration_file_name>');
        
        // List files in migrations folder for utility
        try {
            const files = fs.readdirSync(__dirname)
                .filter(file => file.endsWith('.sql'));
            console.log('\nAvailable migrations:');
            files.forEach(f => console.log(`  - ${f}`));
        } catch (e) {
            // Ignore readdir error
        }
        process.exit(1);
    }

    const filePath = path.join(__dirname, targetFile);

    if (!fs.existsSync(filePath)) {
        console.error(`❌ Error: Migration file not found at: ${filePath}`);
        process.exit(1);
    }

    console.log(`📖 Reading migration file: ${targetFile}...`);
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
        console.log('🔌 Connected to the database. Starting migration transaction...');
        
        // Begin transaction
        await client.query('BEGIN');
        
        // Run SQL script
        await client.query(sql);
        
        // Commit transaction
        await client.query('COMMIT');
        
        console.log('✅ Migration completed successfully and transaction committed!');
    } catch (err) {
        try {
            console.log('🔄 Error encountered. Rolling back transaction...');
            await client.query('ROLLBACK');
        } catch (rollbackErr) {
            console.error('❌ Rollback failed:', rollbackErr.message);
        }
        console.error('❌ Migration failed with error:', err.message);
        console.error(err);
        process.exit(1);
    } finally {
        await client.end();
        console.log('🔌 Connection closed.');
    }
}

runMigration();
