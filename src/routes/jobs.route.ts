import { Router } from 'express';
import { createJobHandler, getJobHandler } from '../controllers/jobs.controller';

const router = Router();

router.post('/jobs', createJobHandler);
router.get('/jobs/:id', getJobHandler);

export default router;