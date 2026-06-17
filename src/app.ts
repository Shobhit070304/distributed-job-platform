import express from 'express';
import jobsRouter from './routes/jobs.route';

const app = express();
app.use(express.json());
app.use('/api', jobsRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

export default app;