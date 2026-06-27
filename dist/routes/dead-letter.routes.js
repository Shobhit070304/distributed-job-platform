"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const dead_letter_controller_1 = require("../controllers/dead-letter.controller");
const router = (0, express_1.Router)();
router.get('/dead-letter', dead_letter_controller_1.listDeadLetterJobsHandler);
router.post('/dead-letter/:id/retry', dead_letter_controller_1.retryDeadLetterJobHandler);
router.delete('/dead-letter/:id', dead_letter_controller_1.discardDeadLetterJobHandler);
exports.default = router;
