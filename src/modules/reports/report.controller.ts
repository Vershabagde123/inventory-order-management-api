import type { Request, Response } from 'express';
import { reportService } from './report.service.js';
import { lowStockQuerySchema } from './report.validation.js';

export const reportController = {
  /** GET /reports/low-stock?threshold=10 (ADMIN, STAFF) */
  async lowStock(req: Request, res: Response): Promise<void> {
    const { threshold } = lowStockQuerySchema.parse(req.query);
    const items = await reportService.lowStock(threshold);
    res.status(200).json({ success: true, threshold, count: items.length, data: items });
  },
};
