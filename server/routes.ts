import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { insertInvoiceSchema, insertInvoiceItemSchema, insertInvoiceRequestSchema } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get(api.dashboard.getStats.path, async (req, res) => {
    const month = req.query.month ? parseInt(req.query.month as string) : undefined;
    const year = req.query.year ? parseInt(req.query.year as string) : undefined;
    const currency = req.query.currency as string | undefined;
    const stats = await storage.getDashboardStats(month, year, currency);
    res.json(stats);
  });

  app.get(api.invoices.getNextNumber.path, async (req, res) => {
    const nextNumber = await storage.getNextInvoiceNumber();
    res.json({ nextNumber });
  });

  app.get("/api/invoices", async (req, res) => {
    const invoices = await storage.getAllInvoices();
    res.json(invoices);
  });

  app.get("/api/invoices/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const invoice = await storage.getInvoice(id);
      if (!invoice) return res.status(404).json({ message: "Invoice not found" });
      const items = await storage.getInvoiceItems(id);
      res.json({ invoice, items });
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.invoices.create.path, async (req, res) => {
    try {
      const input = api.invoices.create.input.parse(req.body);
      const invoice = await storage.createInvoice(input.invoice, input.items);
      res.status(201).json(invoice);
    } catch (err) {
      console.error("Error creating invoice:", err);
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Internal server error", error: String(err) });
    }
  });

  app.delete("/api/invoices/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteInvoice(id);
      res.sendStatus(204);
    } catch (err) {
      console.error("Error deleting invoice:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/invoices/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { invoice, items } = req.body;
      
      if (invoice) {
        const numericFields = ['subtotal', 'totalAmount', 'paidAmount', 'payableAmount', 'depositValue', 'depositRequested', 'payableAfterDeposit', 'taxValue', 'subtotalDiscountValue'];
        numericFields.forEach(field => {
          if (invoice[field] !== undefined) {
            invoice[field] = String(invoice[field]);
          }
        });
      }

      if (items && Array.isArray(items)) {
        items.forEach(item => {
          const itemNumericFields = ['price', 'discountValue', 'total'];
          itemNumericFields.forEach(field => {
            if (item[field] !== undefined) {
              item[field] = String(item[field]);
            }
          });
        });
      }

      const invoiceData = insertInvoiceSchema.partial().parse(invoice);
      const itemsData = items ? z.array(insertInvoiceItemSchema.omit({ invoiceId: true })).parse(items) : undefined;

      const updatedInvoice = await storage.updateInvoice(id, invoiceData, itemsData);
      
      if (!updatedInvoice) {
        return res.status(404).json({ message: "Invoice not found or no changes made" });
      }
      
      res.json(updatedInvoice);
    } catch (err) {
      console.error("Error updating invoice:", err);
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Invoice Requests ──────────────────────────────────────────
  app.get("/api/invoice-requests", async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const requests = await storage.getInvoiceRequests(status);
      res.json(requests);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/invoice-requests", async (req, res) => {
    try {
      const b = req.body;
      const normalized = {
        clientName:  b.clientName  || b.client_name  || b.name  || b.fullName  || b.full_name  || "",
        clientEmail: b.clientEmail || b.client_email || b.email || "",
        clientPhone: b.clientPhone || b.client_phone || b.phone || b.mobile    || b.contact    || "",
        serviceName: b.serviceName || b.service_name || b.service || b.package || b.subject    || b.title || "",
        price:       String(b.price  || b.budget || b.amount || b.cost || ""),
        message:     b.message     || b.description  || b.notes || b.details   || b.note       || "",
      };
      const data = insertInvoiceRequestSchema.parse(normalized);
      const request = await storage.createInvoiceRequest(data);
      res.status(201).json(request);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, errors: err.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Accept Invoice Request → Auto Generate Invoice ────────────
  app.patch("/api/invoice-requests/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { status } = req.body;
      if (!["pending", "accepted", "declined"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      const updated = await storage.updateInvoiceRequestStatus(id, status);

      // Auto-generate invoice when request is accepted
      if (status === "accepted") {
        try {
          const nextNumber = await storage.getNextInvoiceNumber();
          const priceNum = parseFloat(updated.price || "0") || 0;
          const invoiceData = {
            invoiceNumber: nextNumber,
            issueDate: new Date(),
            dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            currency: "USD",
            clientName: updated.clientName,
            clientEmail: updated.clientEmail,
            clientPhone: updated.clientPhone || "",
            subtotal: String(priceNum),
            subtotalDiscountValue: "0",
            subtotalDiscountType: "fixed",
            taxValue: "0",
            taxType: "fixed",
            totalAmount: String(priceNum),
            depositType: "fixed",
            depositValue: "0",
            depositRequested: "0",
            payableAfterDeposit: String(priceNum),
            paidAmount: "0",
            payableAmount: String(priceNum),
            description: updated.message || "",
            status: "Unpaid",
          };
          const items = [{
            title: updated.serviceName,
            description: updated.message || "",
            price: String(priceNum),
            discountValue: "0",
            discountType: "fixed",
            total: String(priceNum),
          }];
          const newInvoice = await storage.createInvoice(invoiceData as any, items);
          return res.json({ ...updated, generatedInvoiceId: newInvoice.id });
        } catch (invoiceErr) {
          console.error("Auto-invoice generation failed:", invoiceErr);
          // Still return success for status update even if invoice gen fails
          return res.json(updated);
        }
      }

      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.quotes.create.path, async (req, res) => {
    try {
      const input = api.quotes.create.input.parse(req.body);
      const quote = await storage.createQuote(input);
      res.status(201).json(quote);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  return httpServer;
}
