"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const stats_controller_1 = require("../controllers/stats.controller");
const router = (0, express_1.Router)();
router.get('/stats', stats_controller_1.getStatsHandler);
router.get('/jobs', stats_controller_1.listJobsHandler);
exports.default = router;
