"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateEnv = validateEnv;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
function validateEnv() {
    const required = ['DATABASE_URL'];
    const missing = required.filter((key) => !process.env[key]);
    if (missing.length > 0) {
        console.error(`[fatal] Missing required environment variables: ${missing.join(', ')}`);
        process.exit(1);
    }
}
