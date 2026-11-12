import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import locationRoutes from './routes/locations.js';
import roleRoutes from './routes/roles.js';
import transferRoutes from './routes/transfers.js';
import aodRoutes from './routes/aods.js';
import masterProductRoutes from './routes/masterProducts.js';

const app = express();
const localOrigins = /^http:\/\/localhost:\d+$/;
app.use(cors({
  origin(origin, callback) {
    if (!origin || origin === process.env.CLIENT_URL || localOrigins.test(origin)) return callback(null, true);
    callback(new Error('Origin is not allowed by CORS.'));
  }
}));
app.use(express.json());
app.use('/uploads', express.static('uploads'));
app.get('/', (_req, res) => res.json({ service: 'RLA Transfer API', status: 'ok', health: '/api/health' }));
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/locations', locationRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/transfers', transferRoutes);
app.use('/api/aods', aodRoutes);
app.use('/api/master-products', masterProductRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ message: 'An unexpected error occurred.' }); });

const port = Number(process.env.PORT || 5000);

async function startServer() {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('PORT must be an integer between 1 and 65535.');
    process.exit(1);
  }
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is missing. Set it in the deployment runtime environment.');
    process.exit(1);
  }

  console.log('Connecting to MongoDB before starting the API...');
  try {
    await mongoose.connect(process.env.MONGODB_URI);
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    process.exit(1);
  }

  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`API listening on 0.0.0.0:${port}; health check: /api/health`);
  });
  server.on('error', error => {
    console.error('API failed to listen:', error.message);
    process.exit(1);
  });
}

startServer();

export default app;
