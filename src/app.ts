import express from 'express';
import jobsRouter from './routes/jobs.route';
import deadLetterRouter from './routes/dead-letter.routes';
import statsRouter from './routes/stats.routes';
import path from 'path';

const app = express();

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.json());

app.use('/api', jobsRouter);
app.use('/api', deadLetterRouter);
app.use('/api', statsRouter);


app.get('/health', (_req, res) => res.json({ status: 'ok' }));


export default app;