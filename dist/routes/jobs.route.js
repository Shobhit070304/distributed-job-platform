"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const jobs_controller_1 = require("../controllers/jobs.controller");
const router = (0, express_1.Router)();
router.post('/jobs', jobs_controller_1.createJobHandler);
router.get('/jobs/:id', jobs_controller_1.getJobHandler);
exports.default = router;
