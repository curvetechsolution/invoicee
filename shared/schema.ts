import { pgTable, text, serial, integer, boolean, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// === TABLE DEFINITIONS ===

export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  invoiceNumber: integer("invoice_number").notNull().unique(),
  issueDate: timestamp("issue_date").notNull().defaultNow(),
  dueDate: timestamp("due_date").notNull(),
  currency: text("currency").notNull(), // USD, GBP, PKR, EUR
  
  // Company Details (Static as per requirements, but we store relevant per-invoice data if needed)
  // Requirements state: Show clearly on the invoice preview: Curve Tech Solution, etc.
  
  // Client Details
  clientName: text("client_name").notNull(),
  clientEmail: text("client_email").notNull(),
  clientPhone: text("client_phone").notNull(),
  
  // Totals & Calcs
  subtotal: numeric("subtotal").notNull(),
  subtotalDiscountValue: numeric("subtotal_discount_value").default("0"),
  subtotalDiscountType: text("subtotal_discount_type"), // 'percentage', 'fixed'
  taxValue: numeric("tax_value").default("0"),
  taxType: text("tax_type"), // 'percentage', 'fixed'
  totalAmount: numeric("total_amount").notNull(),
  
  // Deposit Logic
  depositType: text("deposit_type"), // 'percentage', 'fixed'
  depositValue: numeric("deposit_value").default("0"),
  depositRequested: numeric("deposit_requested").default("0"),
  payableAfterDeposit: numeric("payable_after_deposit").default("0"),
  
  // Paid/Payable Logic
  paidAmount: numeric("paid_amount").default("0"),
  payableAmount: numeric("payable_amount").default("0"),
  
  description: text("description"),
  status: text("status").notNull().default("Unpaid"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const invoiceItems = pgTable("invoice_items", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").references(() => invoices.id).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  price: numeric("price").notNull(),
  discountValue: numeric("discount_value").default("0"),
  discountType: text("discount_type"), // 'percentage', 'fixed'
  total: numeric("total").notNull(),
});

export const quotes = pgTable("quotes", {
  id: serial("id").primaryKey(),
  quoteNumber: text("quote_number").notNull().unique(),
  clientName: text("client_name").notNull(),
  amount: numeric("amount").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const invoiceRequests = pgTable("invoice_requests", {
  id: serial("id").primaryKey(),
  clientName: text("client_name").notNull(),
  clientEmail: text("client_email").notNull(),
  clientPhone: text("client_phone").default(""),
  serviceName: text("service_name").notNull(),
  price: text("price").notNull(),
  message: text("message").default(""),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

// === BASE SCHEMAS ===
export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, createdAt: true });
export const insertInvoiceItemSchema = createInsertSchema(invoiceItems).omit({ id: true });
export const insertQuoteSchema = createInsertSchema(quotes).omit({ id: true, createdAt: true });
export const insertInvoiceRequestSchema = createInsertSchema(invoiceRequests).omit({ id: true, createdAt: true, status: true });

// === EXPLICIT API CONTRACT TYPES ===
export type Invoice = typeof invoices.$inferSelect;
export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type Quote = typeof quotes.$inferSelect;
export type InvoiceRequest = typeof invoiceRequests.$inferSelect;

export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type InsertInvoiceItem = z.infer<typeof insertInvoiceItemSchema>;
export type InsertQuote = z.infer<typeof insertQuoteSchema>;
export type InsertInvoiceRequest = z.infer<typeof insertInvoiceRequestSchema>;

export interface CreateInvoiceRequest extends InsertInvoice {
  items: InsertInvoiceItem[];
}

export interface DashboardStats {
  totalSales: number;
  totalInvoices: number;
  totalReceivables: number;
  totalQuotes: number;
}
