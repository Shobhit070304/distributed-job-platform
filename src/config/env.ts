import dotenv from 'dotenv';
dotenv.config();

export function validateEnv(): void {
    const required = ['DATABASE_URL'] as const;
    const missing = required.filter((key) => !process.env[key]);

    if (missing.length > 0) {
        console.error(
            `[fatal] Missing required environment variables: ${missing.join(', ')}`
        );
        process.exit(1);
    }
}