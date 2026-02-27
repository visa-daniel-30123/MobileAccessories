import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import branchesRoutes from './routes/branches.js';
import productsRoutes from './routes/products.js';
import stockRoutes from './routes/stock.js';
import salesRoutes from './routes/sales.js';
import transfersRoutes from './routes/transfers.js';

dotenv.config();

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/branches', branchesRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/transfers', transfersRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server: http://localhost:${PORT}`));
