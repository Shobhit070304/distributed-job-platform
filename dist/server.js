"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const env_1 = require("./config/env");
(0, env_1.validateEnv)();
const app_1 = __importDefault(require("./app"));
const db_1 = require("./config/db");
const PORT = process.env.PORT || 3000;
const server = app_1.default.listen(PORT, () => {
    console.log(`[api] Server running on http://localhost:${PORT}`);
});
async function shutdown(signal) {
    console.log(`[api] ${signal} received — shutting down gracefully`);
    server.close(async () => {
        console.log('[api] HTTP server closed');
        await db_1.pool.end();
        console.log('[api] DB pool closed — exiting');
        process.exit(0);
    });
    // Force exit if graceful shutdown takes too long
    setTimeout(() => {
        console.error('[api] Forced shutdown after timeout');
        process.exit(1);
    }, 10000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
