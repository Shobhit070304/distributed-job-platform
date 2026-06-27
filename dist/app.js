"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const jobs_route_1 = __importDefault(require("./routes/jobs.route"));
const dead_letter_routes_1 = __importDefault(require("./routes/dead-letter.routes"));
const stats_routes_1 = __importDefault(require("./routes/stats.routes"));
const path_1 = __importDefault(require("path"));
const app = (0, express_1.default)();
app.use(express_1.default.static(path_1.default.join(__dirname, '..', 'public')));
app.use(express_1.default.json());
app.use('/api', jobs_route_1.default);
app.use('/api', dead_letter_routes_1.default);
app.use('/api', stats_routes_1.default);
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
exports.default = app;
