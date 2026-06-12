import { z } from 'zod';
import { insertInvoiceSchema, insertInvoiceItemSchema, insertQuoteSchema } from './schema';

export const api = {
  dashboard: {
    getStats: {
      method: 'GET' as const,
      path: '/api/stats',
      responses: {
        200: z.object({
          totalSales: z.number(),
          totalInvoices: z.number(),
          totalReceivables: z.number(),
          totalQuotes: z.number(),
        }),
      },
    },
  },
  invoices: {
    create: {
      method: 'POST' as const,
      path: '/api/invoices',
      input: z.object({
        invoice: insertInvoiceSchema.extend({
          issueDate: z.coerce.date(),
          dueDate: z.coerce.date(),
        }),
        items: z.array(insertInvoiceItemSchema.omit({ invoiceId: true }))
      }),
      responses: {
        201: z.object({ id: z.number() }),
      },
    },
    getNextNumber: {
      method: 'GET' as const,
      path: '/api/invoices/next-number',
      responses: {
        200: z.object({ nextNumber: z.number() }),
      },
    },
  },
  quotes: {
    create: {
      method: 'POST' as const,
      path: '/api/quotes',
      input: insertQuoteSchema,
      responses: {
        201: z.object({ id: z.number() }),
      },
    },
  }
};
