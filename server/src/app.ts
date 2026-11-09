import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import path from 'node:path';
import { env, allowedOrigins } from './config/env.js';
import { globalLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './utils/http.js';

import authRoutes from './routes/auth.js';
import publicRoutes from './routes/public.js';
import catalogRoutes from './routes/catalog.js';
import inventoryRoutes from './routes/inventory.js';
import orderRoutes from './routes/orders.js';
import accountRoutes from './routes/account.js';
import posRoutes from './routes/pos.js';
import customerRoutes from './routes/customers.js';
import supplierRoutes from './routes/suppliers.js';
import purchaseRoutes from './routes/purchases.js';
import financeRoutes from './routes/finance.js';
import returnRoutes from './routes/returns.js';
import employeeRoutes from './routes/employees.js';
import dashboardRoutes from './routes/dashboard.js';
import adminSettingsRoutes from './routes/adminSettings.js';
import uploadRoutes from './routes/uploads.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('Origin not allowed by CORS'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    })
  );

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(cookieParser());
  app.use(globalLimiter);

  if (!env.isProd && !env.isTest) {
    app.use((req, _res, next) => {
      if (req.path.startsWith('/api')) {
        console.log(`${req.method} ${req.originalUrl}`);
      }
      next();
    });
  }

  app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads'), { maxAge: '7d' }));

  app.get('/api/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok', name: 'HILAAL API', time: new Date().toISOString() } });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/admin/catalog', catalogRoutes);
  app.use('/api/admin', adminSettingsRoutes);
  app.use('/api/inventory', inventoryRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/account', accountRoutes);
  app.use('/api/pos', posRoutes);
  app.use('/api/customers', customerRoutes);
  app.use('/api/suppliers', supplierRoutes);
  app.use('/api/purchases', purchaseRoutes);
  app.use('/api/finance', financeRoutes);
  app.use('/api/returns', returnRoutes);
  app.use('/api/employees', employeeRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/uploads', uploadRoutes);

  // Public storefront routes last so they cannot shadow admin routes.
  app.use('/api', publicRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
