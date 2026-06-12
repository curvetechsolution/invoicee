import { db } from "./db";
import {
  invoices,
  invoiceItems,
  quotes,
  invoiceRequests,
  type InsertInvoice,
  type InsertInvoiceItem,
  type InsertInvoiceRequest,
  type InsertQuote,
  type Invoice,
  type Quote,
  type InvoiceRequest,
  type DashboardStats
} from "@shared/schema";
import { sql, eq, desc } from "drizzle-orm";

export interface IStorage {
  getDashboardStats(month?: number, year?: number): Promise<DashboardStats>;
  getNextInvoiceNumber(): Promise<number>;
  createInvoice(invoice: InsertInvoice, items: any[]): Promise<Invoice>;
  createQuote(quote: InsertQuote): Promise<Quote>;
  getAllInvoices(): Promise<Invoice[]>;
  getInvoice(id: number): Promise<Invoice | undefined>;
  getInvoiceItems(invoiceId: number): Promise<any[]>;
  deleteInvoice(id: number): Promise<void>;
  updateInvoice(id: number, invoice: Partial<InsertInvoice>, items?: any[]): Promise<Invoice>;
  getInvoiceRequests(status?: string): Promise<InvoiceRequest[]>;
  createInvoiceRequest(data: InsertInvoiceRequest): Promise<InvoiceRequest>;
  updateInvoiceRequestStatus(id: number, status: string): Promise<InvoiceRequest>;
}

export class DatabaseStorage implements IStorage {
  async getAllInvoices(): Promise<Invoice[]> {
    return await db.select().from(invoices).orderBy(desc(invoices.id));
  }

  async getInvoice(id: number): Promise<Invoice | undefined> {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
    return invoice;
  }

  async getInvoiceItems(invoiceId: number): Promise<any[]> {
    return await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
  }

  async deleteInvoice(id: number): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(invoiceItems).where(eq(invoiceItems.invoiceId, id));
      await tx.delete(invoices).where(eq(invoices.id, id));
    });
  }

  async updateInvoice(id: number, invoiceUpdate: any, items?: any[]): Promise<Invoice> {
    return await db.transaction(async (tx) => {
      // Create a clean update object
      const { id: _, createdAt: __, ...updateData } = invoiceUpdate;
      
      const [updatedInvoice] = await tx
        .update(invoices)
        .set(updateData)
        .where(eq(invoices.id, id))
        .returning();

      if (items) {
        // Delete existing items
        await tx.delete(invoiceItems).where(eq(invoiceItems.invoiceId, id));
        
        // Prepare new items with correct types and invoiceId
        const itemsWithId = items.map(item => {
          const { id: ___, invoiceId: ____, ...itemData } = item;
          return {
            ...itemData,
            invoiceId: id,
            price: String(itemData.price),
            discountValue: String(itemData.discountValue),
            total: String(itemData.total)
          };
        });

        if (itemsWithId.length > 0) {
          await tx.insert(invoiceItems).values(itemsWithId);
        }
      }

      return updatedInvoice;
    });
  }

  async getDashboardStats(month?: number, year?: number, selectedCurrency: string = "USD"): Promise<DashboardStats> {
    try {
      let allInvoices = await db.select().from(invoices);
      const allQuotes = await db.select().from(quotes);

      // Fixed Conversion Rates (USD as base)
      const rates: Record<string, number> = {
        "USD": 1,
        "PKR": 280,
        "EUR": 0.92,
        "GBP": 0.78
      };

      // month is 0-indexed, -1 represents 'All'
      if (month !== undefined && month !== -1 && year !== undefined) {
        allInvoices = allInvoices.filter(inv => {
          const date = new Date(inv.issueDate);
          return date.getMonth() === month && date.getFullYear() === year;
        });
      }

      const convertToUSD = (amount: number, fromCurrency: string): number => {
        if (fromCurrency === "USD") return amount;
        const rate = rates[fromCurrency] || 1;
        return amount / rate;
      };

      const convertFromUSD = (amountUSD: number, toCurrency: string): number => {
        if (toCurrency === "USD") return amountUSD;
        const rate = rates[toCurrency] || 1;
        return amountUSD * rate;
      };

      const totalSales = allInvoices
        .reduce((sum, inv) => {
          const invoiceAmount = Number(inv.totalAmount || 0);
          const invoiceCurrency = inv.currency || "USD";
          const amountUSD = convertToUSD(invoiceAmount, invoiceCurrency);
          const convertedAmount = convertFromUSD(amountUSD, selectedCurrency);
          return sum + convertedAmount;
        }, 0);

      const totalReceivables = allInvoices
        .reduce((sum, inv) => {
          const receivableAmount = Number(inv.payableAmount || 0);
          const invoiceCurrency = inv.currency || "USD";
          const amountUSD = convertToUSD(receivableAmount, invoiceCurrency);
          const convertedAmount = convertFromUSD(amountUSD, selectedCurrency);
          return sum + convertedAmount;
        }, 0);

      return {
        totalSales,
        totalInvoices: allInvoices.length,
        totalReceivables,
        totalQuotes: allQuotes.length
      };
    } catch (error) {
      console.error("Error getting dashboard stats:", error);
      return {
        totalSales: 0,
        totalInvoices: 0,
        totalReceivables: 0,
        totalQuotes: 0
      };
    }
  }

  async getNextInvoiceNumber(): Promise<number> {
    try {
      const result = await db.select({ max: sql<number>`max(${invoices.invoiceNumber})` }).from(invoices);
      const maxNum = result[0]?.max;
      
      // If no invoices exist, start at 580
      if (maxNum === null || maxNum === undefined) {
        return 580;
      }
      
      return Number(maxNum) + 1;
    } catch (error) {
      console.error("Error getting next invoice number:", error);
      return 580;
    }
  }

  async createInvoice(insertInvoice: InsertInvoice, items: any[]): Promise<Invoice> {
    return await db.transaction(async (tx) => {
      const [invoice] = await tx.insert(invoices).values(insertInvoice).returning();
      
      if (items && items.length > 0) {
        const itemsWithId = items.map(item => ({
          ...item,
          invoiceId: invoice.id
        }));
        await tx.insert(invoiceItems).values(itemsWithId);
      }
      
      return invoice;
    });
  }

  async createQuote(insertQuote: InsertQuote): Promise<Quote> {
    const [quote] = await db.insert(quotes).values(insertQuote).returning();
    return quote;
  }

  async getInvoiceRequests(status?: string): Promise<InvoiceRequest[]> {
    const all = await db.select().from(invoiceRequests).orderBy(desc(invoiceRequests.createdAt));
    if (status) return all.filter(r => r.status === status);
    return all;
  }

  async createInvoiceRequest(data: InsertInvoiceRequest): Promise<InvoiceRequest> {
    const [req] = await db.insert(invoiceRequests).values(data).returning();
    return req;
  }

  async updateInvoiceRequestStatus(id: number, status: string): Promise<InvoiceRequest> {
    const [updated] = await db
      .update(invoiceRequests)
      .set({ status })
      .where(eq(invoiceRequests.id, id))
      .returning();
    return updated;
  }
}

export const storage = new DatabaseStorage();
