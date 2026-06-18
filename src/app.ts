import express from 'express';
import jobsRouter from './routes/jobs.route';
import deadLetterRouter from './routes/dead-letter.routes';

const app = express();
app.use(express.json());
app.use('/api', jobsRouter);
app.use('/api', deadLetterRouter);


app.get('/health', (_req, res) => res.json({ status: 'ok' }));

export default app;