import { Router } from 'express';
import {
    listDeadLetterJobsHandler,
    retryDeadLetterJobHandler,
    discardDeadLetterJobHandler,
} from '../controllers/dead-letter.controller';

const router = Router();

router.get('/dead-letter', listDeadLetterJobsHandler);
router.post('/dead-letter/:id/retry', retryDeadLetterJobHandler);
router.delete('/dead-letter/:id', discardDeadLetterJobHandler);

export default router;