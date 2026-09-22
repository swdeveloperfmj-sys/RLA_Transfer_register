import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import locationRoutes from './routes/locations.js';
import roleRoutes from './routes/roles.js';

const app = express();
const localOrigins = /^http:\/\/localhost:\d+$/;
app.use(cors({
  origin(origin, callback) {
    if (!origin || origin === process.env.CLIENT_URL || localOrigins.test(origin)) return callback(null, true);
    callback(new Error('Origin is not allowed by CORS.'));
  }
}));
app.use(express.json());
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/locations', locationRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ message: 'An unexpected error occurred.' }); });

mongoose.connect(process.env.MONGODB_URI).then(() => app.listen(process.env.PORT || 5000, () => console.log('API running'))).catch(error => { console.error('MongoDB connection failed:', error.message); process.exit(1); });
