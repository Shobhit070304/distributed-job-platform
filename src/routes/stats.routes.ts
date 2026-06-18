import { Router } from 'express';
import { getStatsHandler, listJobsHandler } from '../controllers/stats.controller';

const router = Router();

router.get('/stats', getStatsHandler);
router.get('/jobs', listJobsHandler);

export default router;