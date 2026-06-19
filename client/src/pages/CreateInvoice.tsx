import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertInvoiceSchema, insertInvoiceItemSchema, type Invoice } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import logoImg from "@assets/Curve_Tech_Solution_Logo_1767002702612.png";
import { format } from "date-fns";
import { z } from "zod";

const formSchema = z.object({
  invoice: insertInvoiceSchema,
  items: z.array(insertInvoiceItemSchema.omit({ invoiceId: true })).min(1, "At least one item is required")
});

type FormValues = z.infer<typeof formSchema>;

export default function CreateInvoice({ params }: { params?: { id?: string } }) {
  const isEditMode = window.location.pathname.includes("/edit");
  const isPreviewMode = window.location.pathname.includes("/preview");
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: invoiceData } = useQuery<{ invoice: Invoice, items: any[] }>({
    queryKey: [`/api/invoices/${params?.id}`],
    enabled: !!params?.id && (isEditMode || isPreviewMode)
  });

  const { data: nextNumData } = useQuery<{ nextNumber: number }>({
    queryKey: ["/api/invoices/next-number"],
    enabled: !params?.id
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      invoice: {
        invoiceNumber: 0,
        currency: "USD",
        issueDate: new Date(),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        clientName: "",
        clientEmail: "",
        clientPhone: "",
        subtotal: "0",
        subtotalDiscountValue: "0",
        subtotalDiscountType: "fixed",
        taxValue: "0",
        taxType: "fixed",
        totalAmount: "0",
        depositType: "fixed",
        depositValue: "0",
        depositRequested: "0",
        payableAfterDeposit: "0",
        paidAmount: "0",
        payableAmount: "0",
        description: "",
        status: "Unpaid"
      },
      items: [{ title: "", description: "", price: "0", discountValue: "0", discountType: "fixed", total: "0" }]
    }
  });

  useEffect(() => {
    const storedInvoices = JSON.parse(localStorage.getItem("invoices") || "[]");
    const invoiceId = params?.id ? params.id : null; // keep as string for comparison
    const isEditMode = invoiceId !== undefined && invoiceId !== null;
    
    if (isEditMode) {
      // Find by id OR invoiceNumber — compare as strings to avoid type mismatch
      const existingInvoice = storedInvoices.find((inv: any) =>
        String(inv.id) === String(invoiceId) || String(inv.invoiceNumber) === String(invoiceId)
      );
      if (existingInvoice) {
        form.reset({
          invoice: existingInvoice,
          items: (existingInvoice.items || []).map((item: any) => ({
            ...item,
            price: String(item.price),
            discountValue: String(item.discountValue || "0"),
            total: String(item.total)
          }))
        });
      } else if (invoiceData) {
        form.reset({
          invoice: invoiceData.invoice,
          items: invoiceData.items.map(item => ({
            ...item,
            price: String(item.price),
            discountValue: String(item.discountValue),
            total: String(item.total)
          }))
        });
      }
    }
  }, [params?.id, invoiceData, form]);

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items"
  });

  useEffect(() => {
    if (nextNumData?.nextNumber) {
      form.setValue("invoice.invoiceNumber", nextNumData.nextNumber);
    }
  }, [nextNumData, form]);

  const watchedItems = form.watch("items");
  const subtotalDiscountValue = form.watch("invoice.subtotalDiscountValue") || "0";
  const subtotalDiscountType = form.watch("invoice.subtotalDiscountType") || "fixed";
  const taxValue = form.watch("invoice.taxValue") || "0";
  const taxType = form.watch("invoice.taxType") || "fixed";
  const depositValue = form.watch("invoice.depositValue") || "0";
  const depositType = form.watch("invoice.depositType") || "fixed";
  const paidAmount = form.watch("invoice.paidAmount") || "0";

  // Dedicated calculation function for items and totals
  const recalculateTotals = () => {
    const items = form.getValues("items");
    const subDiscVal = form.getValues("invoice.subtotalDiscountValue") || "0";
    const subDiscType = form.getValues("invoice.subtotalDiscountType") || "fixed";
    const taxV = form.getValues("invoice.taxValue") || "0";
    const taxT = form.getValues("invoice.taxType") || "fixed";
    const depV = form.getValues("invoice.depositValue") || "0";
    const depT = form.getValues("invoice.depositType") || "fixed";
    const paidA = form.getValues("invoice.paidAmount") || "0";

    let subtotal = 0;
    items.forEach((item, index) => {
      const price = parseFloat(String(item.price)) || 0;
      const discount = parseFloat(String(item.discountValue)) || 0;
      let itemTotal = price;
      if (item.discountType === "percentage") {
        itemTotal = price - (price * discount / 100);
      } else {
        itemTotal = price - discount;
      }
      subtotal += itemTotal;
      
      const currentTotal = form.getValues(`items.${index}.total`);
      if (parseFloat(String(currentTotal)) !== itemTotal) {
        form.setValue(`items.${index}.total`, itemTotal.toFixed(2), { shouldDirty: true, shouldValidate: true });
      }
    });

    const sDiscount = parseFloat(String(subDiscVal)) || 0;
    let subtotalAfterDiscount = subtotal;
    if (subDiscType === "percentage") {
      subtotalAfterDiscount = subtotal - (subtotal * sDiscount / 100);
    } else {
      subtotalAfterDiscount = subtotal - sDiscount;
    }

    const tVal = parseFloat(String(taxV)) || 0;
    let finalTotal = subtotalAfterDiscount;
    if (taxT === "percentage") {
      finalTotal = subtotalAfterDiscount + (subtotalAfterDiscount * tVal / 100);
    } else {
      finalTotal = subtotalAfterDiscount + tVal;
    }

    const subtotalStr = subtotal.toFixed(2);
    const finalTotalStr = finalTotal.toFixed(2);

    if (form.getValues("invoice.subtotal") !== subtotalStr) {
      form.setValue("invoice.subtotal", subtotalStr, { shouldDirty: true, shouldValidate: true });
    }
    if (form.getValues("invoice.totalAmount") !== finalTotalStr) {
      form.setValue("invoice.totalAmount", finalTotalStr, { shouldDirty: true, shouldValidate: true });
    }

    const dVal = parseFloat(String(depV)) || 0;
    let depRequested = 0;
    if (depT === "percentage") {
      depRequested = finalTotal * dVal / 100;
    } else {
      depRequested = dVal;
    }
    const depRequestedStr = depRequested.toFixed(2);
    const payableAfterDepositStr = (finalTotal - depRequested).toFixed(2);
    
    if (form.getValues("invoice.depositRequested") !== depRequestedStr) {
      form.setValue("invoice.depositRequested", depRequestedStr, { shouldDirty: true, shouldValidate: true });
    }
    if (form.getValues("invoice.payableAfterDeposit") !== payableAfterDepositStr) {
      form.setValue("invoice.payableAfterDeposit", payableAfterDepositStr, { shouldDirty: true, shouldValidate: true });
    }

    const pAmount = parseFloat(String(paidA)) || 0;
    const finalTotalNum = parseFloat(finalTotalStr) || 0;
    const payableAmountStr = (finalTotalNum - pAmount).toFixed(2);
    if (form.getValues("invoice.payableAmount") !== payableAmountStr) {
      form.setValue("invoice.payableAmount", payableAmountStr, { shouldDirty: true, shouldValidate: true });
    }
    
    // Status update logic
    let newStatus = "Unpaid";
    if (pAmount >= finalTotalNum && finalTotalNum > 0) {
      newStatus = "Paid";
    } else if (pAmount > 0) {
      newStatus = "Partial";
    }
    // Only update if it's different and don't overwrite user selection if they manually changed it
    // Actually, per requirements, we should keep it simple and follow the auto-calc if it's based on paidAmount
    if (form.getValues("invoice.status") !== newStatus) {
      form.setValue("invoice.status", newStatus, { shouldDirty: true, shouldValidate: true });
    }
  };

  useEffect(() => {
    recalculateTotals();
  }, [watchedItems, subtotalDiscountValue, subtotalDiscountType, taxValue, taxType, depositValue, depositType, paidAmount, form]);

  const mutation = useMutation({
    mutationFn: async (data: FormValues) => {
      if (isEditMode && params?.id) {
        const { invoiceNumber, createdAt, id, ...cleanInvoice } = data.invoice as any;
        const updateData = {
          invoice: cleanInvoice,
          items: data.items.map(({ id, invoiceId, ...item }: any) => item)
        };
        const res = await apiRequest("PATCH", `/api/invoices/${params.id}`, updateData);
        return res.json();
      } else {
        const res = await apiRequest("POST", "/api/invoices", data);
        return res.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      if (params?.id) {
        queryClient.invalidateQueries({ queryKey: [`/api/invoices/${params.id}`] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/invoices/next-number"] });
    },
    onError: () => {/* DB sync failed silently — localStorage is source of truth */}
  });

  const handleFormSubmit = async (data: FormValues) => {
    try {
      const storedInvoices = JSON.parse(localStorage.getItem("invoices") || "[]");
      const invoiceId = params?.id || null;
      const isEditModeLocal = invoiceId !== undefined && invoiceId !== null && invoiceId !== "";

      if (isEditModeLocal) {
        // UPDATE in localStorage — compare as strings to avoid type mismatch
        const updatedInvoices = storedInvoices.map((inv: any) =>
          String(inv.id) === String(invoiceId) || String(inv.invoiceNumber) === String(invoiceId)
            ? { ...data.invoice, id: inv.id, invoiceNumber: inv.invoiceNumber, items: data.items }
            : inv
        );
        localStorage.setItem("invoices", JSON.stringify(updatedInvoices));
        toast({ title: "✅ Invoice Updated", description: "Your invoice has been updated successfully." });
      } else {
        // CREATE in localStorage
        const newId = data.invoice.invoiceNumber;
        const newInvoice = { ...data.invoice, id: newId, items: data.items };
        localStorage.setItem("invoices", JSON.stringify([...storedInvoices, newInvoice]));
        toast({ title: "✅ Invoice Created", description: "Your invoice has been saved successfully." });
      }

      // Sync with DB in background — don't block or show error to user
      mutation.mutate(data);

      // Redirect immediately — don't wait for DB
      setLocation("/invoices");
    } catch (error) {
      console.error("Error saving to localStorage:", error);
    }
  };

  if (isPreviewMode) {
    const currency = form.getValues("invoice.currency");
    const fmt = (val: any) => `${currency} ${Number(val || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    return (
      <div id="invoice-print-root" className="min-h-screen bg-slate-100 p-4 md:p-8 print:p-0 print:bg-white">
        {/* Action bar — hidden on print */}
        <div id="invoice-action-bar" className="max-w-4xl mx-auto mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-3">
            <Link href="/invoices">
              <Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button>
            </Link>
            <h1 className="text-lg font-semibold text-slate-700">Invoice Preview</h1>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button variant="outline" className="flex-1 sm:flex-none text-sm" onClick={() => {
              window.print();
            }}>Print / Download PDF</Button>
            <Button className="flex-1 sm:flex-none text-sm" onClick={() => setLocation(`/invoices/${params?.id}/edit`)}>Edit Invoice</Button>
          </div>
        </div>

        {/* Invoice paper */}
        <div className="max-w-4xl mx-auto bg-white shadow-sm print:shadow-none print:max-w-none">
          <div className="px-10 py-8">

            {/* ── TOP HEADER: Logo+Company left, INVOICE right ── */}
            <div className="flex items-start justify-between mb-6">
              {/* Left: logo + company name + contact */}
              <div className="flex items-center gap-4">
                <img src={logoImg} alt="Logo" className="w-14 h-14 object-contain" />
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 leading-tight">Curve Tech Solution</h2>
                  <p className="text-sm text-slate-500 mt-0.5">hello@curvetechsolution.online</p>
                  <p className="text-sm text-slate-500">www.curvetechsolution.online</p>
                </div>
              </div>
              {/* Right: INVOICE big heading */}
              <h1 className="text-6xl font-black text-slate-900 tracking-widest uppercase">INVOICE</h1>
            </div>

            {/* ── THIN DIVIDER ── */}
            <hr className="border-slate-200 mb-6" />

            {/* ── OFFICES LEFT + INVOICE META RIGHT — all in one row ── */}
            <div className="flex justify-between items-start mb-8">
              {/* Left: office addresses side by side */}
              <div className="flex gap-14 text-sm">
                <div>
                  <p className="font-bold text-slate-900 uppercase text-xs mb-2 tracking-widest">USA OFFICE</p>
                  <p className="text-slate-600 leading-6">
                    117 South Lexington Street,<br />
                    Ste 100, Harrisonville, MO<br />
                    64701, USA
                  </p>
                </div>
                <div>
                  <p className="font-bold text-slate-900 uppercase text-xs mb-2 tracking-widest">PAKISTAN OFFICE</p>
                  <p className="text-slate-600 leading-6">
                    Office No 4, First Floor, Tariq<br />
                    Business Center, Block H-3,<br />
                    Johar Town, Lahore, 54000
                  </p>
                </div>
              </div>

              {/* Right: 2×2 meta grid — Invoice Number | Bill To / Issue Date | Due Date */}
              <div className="shrink-0">
                <div className="grid grid-cols-2 gap-x-10 gap-y-4">
                  {/* Invoice Number — left col */}
                  <div className="text-right">
                    <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold mb-1">INVOICE NUMBER</p>
                    <p className="text-2xl font-black text-slate-900">#{form.getValues("invoice.invoiceNumber")}</p>
                  </div>
                  {/* Bill To — right col */}
                  <div className="text-right">
                    <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold mb-1">BILL TO</p>
                    <p className="text-base font-bold text-slate-900">{form.getValues("invoice.clientName")}</p>
                    {form.getValues("invoice.clientEmail") && <p className="text-slate-500 text-xs mt-0.5">{form.getValues("invoice.clientEmail")}</p>}
                    {form.getValues("invoice.clientPhone") && <p className="text-slate-500 text-xs">{form.getValues("invoice.clientPhone")}</p>}
                  </div>
                  {/* Issue Date */}
                  <div className="text-right">
                    <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold mb-1">ISSUE DATE</p>
                    <p className="text-slate-700 font-medium text-sm">{form.getValues("invoice.issueDate") ? format(new Date(form.getValues("invoice.issueDate") as any), "MMM d, yyyy") : ""}</p>
                  </div>
                  {/* Due Date */}
                  <div className="text-right">
                    <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold mb-1">DUE DATE</p>
                    <p className="text-red-500 font-bold text-sm">{form.getValues("invoice.dueDate") ? format(new Date(form.getValues("invoice.dueDate") as any), "MMM d, yyyy") : ""}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* ── ITEMS TABLE ── */}
            <div className="border border-slate-200 rounded-lg overflow-hidden mb-8">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-white">
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-widest">Description</th>
                    <th className="px-6 py-4 text-center text-xs font-bold text-slate-500 uppercase tracking-widest w-36">Price</th>
                    <th className="px-6 py-4 text-center text-xs font-bold text-slate-500 uppercase tracking-widest w-36">Discount</th>
                    <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase tracking-widest w-40">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {watchedItems.map((item, idx) => (
                    <tr key={idx} className="border-b border-slate-100 last:border-0 bg-slate-50">
                      <td className="px-6 py-6 align-top">
                        <p className="font-bold text-slate-900 text-sm">{item.title}</p>
                        {item.description && <p className="text-slate-500 text-xs mt-1.5 leading-relaxed">{item.description}</p>}
                      </td>
                      <td className="px-6 py-6 text-center text-slate-600 align-top text-sm">{currency} {Number(item.price || 0).toLocaleString()}</td>
                      <td className="px-6 py-6 text-center text-slate-500 align-top text-sm">
                        {item.discountValue && Number(item.discountValue) > 0
                          ? (item.discountType === "percentage" ? `${item.discountValue}%` : `${currency} ${item.discountValue}`)
                          : "–"}
                      </td>
                      <td className="px-6 py-6 text-right font-bold text-slate-900 align-top text-sm">{fmt(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── BOTTOM: terms left, totals right ── */}
            <div className="flex justify-end gap-12">
              {/* Terms & Conditions — only if present */}
              {form.getValues("invoice.description") && (
                <div className="flex-1">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Terms &amp; Conditions</p>
                  <p className="text-xs text-slate-500 leading-relaxed whitespace-pre-wrap">{form.getValues("invoice.description")}</p>
                </div>
              )}

              {/* Right: totals panel */}
              <div className="w-72 shrink-0">
                {/* Subtotal row */}
                <div className="flex justify-between items-center py-3 border-b border-slate-200">
                  <span className="text-sm text-slate-500">Subtotal</span>
                  <span className="text-sm text-slate-800">{fmt(form.getValues("invoice.subtotal"))}</span>
                </div>

                {/* Subtotal discount row */}
                {Number(form.getValues("invoice.subtotalDiscountValue")) > 0 && (
                  <div className="flex justify-between items-center py-3 border-b border-slate-200">
                    <span className="text-sm text-slate-500">Discount</span>
                    <span className="text-sm text-slate-800">
                      {form.getValues("invoice.subtotalDiscountType") === "percentage"
                        ? `${form.getValues("invoice.subtotalDiscountValue")}%`
                        : fmt(form.getValues("invoice.subtotalDiscountValue"))}
                    </span>
                  </div>
                )}

                {/* Tax row */}
                {Number(form.getValues("invoice.taxValue")) > 0 && (
                  <div className="flex justify-between items-center py-3 border-b border-slate-200">
                    <span className="text-sm text-slate-500">Tax</span>
                    <span className="text-sm text-slate-800">
                      {form.getValues("invoice.taxType") === "percentage"
                        ? `${form.getValues("invoice.taxValue")}%`
                        : fmt(form.getValues("invoice.taxValue"))}
                    </span>
                  </div>
                )}

                {/* Total Due — dark filled box */}
                <div className="bg-slate-900 text-white rounded-md px-5 py-4 flex justify-between items-center mt-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-300">TOTAL DUE</span>
                  <span className="text-xl font-black">{fmt(form.getValues("invoice.totalAmount"))}</span>
                </div>

                {/* Deposit Requested */}
                {Number(form.getValues("invoice.depositRequested")) > 0 && (
                  <div className="flex justify-between items-center pt-4">
                    <span className="text-sm text-slate-500">Deposit Requested</span>
                    <span className="text-sm font-bold text-slate-800">{fmt(form.getValues("invoice.depositRequested"))}</span>
                  </div>
                )}

                {/* Paid Amount */}
                {Number(form.getValues("invoice.paidAmount")) > 0 && (
                  <div className="flex justify-between items-center pt-2">
                    <span className="text-sm text-slate-500">Amount Paid</span>
                    <span className="text-sm font-bold text-slate-800">{fmt(form.getValues("invoice.paidAmount"))}</span>
                  </div>
                )}

                {/* Remaining balance */}
                {Number(form.getValues("invoice.paidAmount")) > 0 && (
                  <div className="flex justify-between items-center pt-3 mt-2 border-t border-slate-200">
                    <span className="text-sm font-bold text-slate-700">Remaining Balance</span>
                    <span className="text-sm font-black text-slate-900">{fmt(form.getValues("invoice.payableAmount"))}</span>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>

        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }

            @page {
              size: A4 portrait;
              margin: 1.5cm;
            }

            html, body {
              background: white !important;
              margin: 0 !important;
              padding: 0 !important;
              width: 100% !important;
            }

            /* ✅ Hide action bar by ID — most reliable method */
            #invoice-action-bar {
              display: none !important;
            }

            /* Outer wrapper */
            #invoice-print-root {
              background: white !important;
              padding: 0 !important;
              margin: 0 !important;
              min-height: unset !important;
            }

            /* Invoice paper — full width, no shadow */
            #invoice-print-root .max-w-4xl {
              max-width: 100% !important;
              margin: 0 !important;
              box-shadow: none !important;
            }

            /* Flex layout preserved */
            #invoice-print-root .flex { display: flex !important; }
            #invoice-print-root .items-start { align-items: flex-start !important; }
            #invoice-print-root .items-center { align-items: center !important; }
            #invoice-print-root .justify-between { justify-content: space-between !important; }
            #invoice-print-root .justify-end { justify-content: flex-end !important; }
            #invoice-print-root .shrink-0 { flex-shrink: 0 !important; }
            #invoice-print-root .flex-1 { flex: 1 1 0% !important; }

            /* Grid preserved */
            #invoice-print-root .grid { display: grid !important; }
            #invoice-print-root .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }

            /* Table full width */
            #invoice-print-root table { width: 100% !important; border-collapse: collapse !important; }
            #invoice-print-root tr, #invoice-print-root th, #invoice-print-root td {
              page-break-inside: avoid !important;
            }

            /* Dark total box */
            #invoice-print-root .bg-slate-900 { background-color: #0f172a !important; }
            #invoice-print-root .bg-slate-50  { background-color: #f8fafc !important; }

            /* Text colors */
            #invoice-print-root .text-white     { color: #ffffff !important; }
            #invoice-print-root .text-red-500   { color: #ef4444 !important; }
            #invoice-print-root .text-slate-300 { color: #cbd5e1 !important; }

            /* Totals panel width */
            #invoice-print-root .w-72 { width: 18rem !important; }
          }
        ` }} />
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-3 sm:p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6 sm:space-y-8">
        <header className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <Link href="/invoices">
              <Button variant="ghost" size="icon" className="shrink-0"><ArrowLeft className="w-5 h-5" /></Button>
            </Link>
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <img src={logoImg} alt="Logo" className="w-8 h-8 sm:w-10 sm:h-10 object-contain shrink-0" />
              <h1 className="text-base sm:text-2xl font-bold truncate">Curve Tech Solution</h1>
            </div>
          </div>
          <Button 
            type="button"
            onClick={async () => {
              const data = form.getValues();
              await handleFormSubmit(data);
            }}
            disabled={mutation.isPending} 
            className="relative z-50 pointer-events-auto shrink-0 text-sm"
          >
            {mutation.isPending ? "Saving..." : (isEditMode ? "Update Invoice" : "Save Invoice")}
          </Button>
        </header>

        <Form {...form}>
          <form id="invoice-form" onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-8">
            <Card>
              <CardHeader className="bg-blue-600 text-white rounded-t-md">
                <CardTitle>Invoice Details</CardTitle>
              </CardHeader>
              <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="font-semibold text-blue-600">Company Information</h3>
                  <div className="text-sm space-y-1">
                    <p className="font-bold">Curve Tech Solution</p>
                    <p>info@curvetechsolution.com</p>
                    <p>www.curvetechsolution.com</p>
                    <div className="mt-2 text-slate-500">
                      <p className="font-semibold">USA Office:</p>
                      <p>117 South Lexington Street, Ste 100, Harrisonville, MO 64701, USA</p>
                      <p className="font-semibold mt-1">Pakistan Office:</p>
                      <p>Office No 4, First Floor, Tariq Business Center, Block H-3, Johar Town, Lahore, 54000</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <FormField control={form.control} name="invoice.invoiceNumber" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Invoice Number</FormLabel>
                          <FormControl><Input {...field} readOnly className="bg-slate-100" value={field.value !== undefined && field.value !== null ? String(field.value) : ""} /></FormControl>
                    </FormItem>
                  )} />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="invoice.currency" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Currency</FormLabel>
                        <Select onValueChange={(val) => { field.onChange(val); }} value={field.value || "USD"}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="USD">USD</SelectItem>
                            <SelectItem value="GBP">GBP</SelectItem>
                            <SelectItem value="PKR">PKR</SelectItem>
                            <SelectItem value="EUR">EUR</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="bg-blue-600 text-white rounded-t-md">
                <CardTitle>Client Details</CardTitle>
              </CardHeader>
              <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField control={form.control} name="invoice.clientName" render={({ field }) => (
                  <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="invoice.clientEmail" render={({ field }) => (
                  <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="invoice.clientPhone" render={({ field }) => (
                  <FormItem><FormLabel>Phone</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                )} />
              </CardContent>
            </Card>

            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg sm:text-xl font-bold text-blue-600">Invoice Items</h2>
                <Button type="button" variant="outline" size="sm" onClick={() => append({ title: "", description: "", price: "0", discountValue: "0", discountType: "fixed", total: "0" })}>
                  <Plus className="w-4 h-4 mr-1 sm:mr-2" /> <span className="hidden xs:inline">Add </span>Item
                </Button>
              </div>

              {fields.map((field, index) => (
                <Card key={field.id} className="bg-sky-50 dark:bg-sky-900/20 border-sky-100">
                  <CardContent className="pt-4 sm:pt-6 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                      <div className="sm:col-span-2">
                        <FormField control={form.control} name={`items.${index}.title`} render={({ field }) => (
                          <FormItem><FormLabel>Title</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl></FormItem>
                        )} />
                      </div>
                      <FormField control={form.control} name={`items.${index}.price`} render={({ field }) => (
                        <FormItem><FormLabel>Price</FormLabel><FormControl><Input type="number" {...field} value={field.value || ""} onChange={(e) => { 
                          const val = e.target.value;
                          field.onChange(val); 
                          form.setValue(`items.${index}.price`, val, { shouldDirty: true, shouldValidate: true });
                          // Force immediate recalculation of the specific item total
                          const discount = parseFloat(String(form.getValues(`items.${index}.discountValue`))) || 0;
                          const discType = form.getValues(`items.${index}.discountType`);
                          const price = parseFloat(val) || 0;
                          let itemTotal = price;
                          if (discType === "percentage") {
                            itemTotal = price - (price * discount / 100);
                          } else {
                            itemTotal = price - discount;
                          }
                          form.setValue(`items.${index}.total`, itemTotal.toFixed(2), { shouldDirty: true, shouldValidate: true });
                          
                          // Manually trigger the global recalculation effect logic
                          form.trigger("items");
                        }} /></FormControl></FormItem>
                      )} />
                      <div className="flex items-end gap-2">
                        <div className="flex-1">
                          <FormField control={form.control} name={`items.${index}.total`} render={({ field }) => (
                            <FormItem><FormLabel>Item Total</FormLabel><FormControl><Input {...field} readOnly className="bg-white/50" value={field.value || ""} /></FormControl></FormItem>
                          )} />
                        </div>
                        <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => remove(index)} disabled={fields.length === 1}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                      <FormField control={form.control} name={`items.${index}.description`} render={({ field }) => (
                        <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea {...field} value={field.value || ""} className="min-h-[80px]" /></FormControl></FormItem>
                      )} />
                      <div className="grid grid-cols-2 gap-2">
                        <FormField control={form.control} name={`items.${index}.discountValue`} render={({ field }) => (
                          <FormItem><FormLabel>Item Discount</FormLabel><FormControl><Input type="number" {...field} value={field.value || ""} onChange={(e) => { 
                            const val = e.target.value;
                            field.onChange(val); 
                            form.setValue(`items.${index}.discountValue`, val, { shouldDirty: true, shouldValidate: true });
                            // Force immediate recalculation of the specific item total
                            const price = parseFloat(String(form.getValues(`items.${index}.price`))) || 0;
                            const discType = form.getValues(`items.${index}.discountType`);
                            const discount = parseFloat(val) || 0;
                            let itemTotal = price;
                            if (discType === "percentage") {
                              itemTotal = price - (price * discount / 100);
                            } else {
                              itemTotal = price - discount;
                            }
                            form.setValue(`items.${index}.total`, itemTotal.toFixed(2), { shouldDirty: true, shouldValidate: true });
                            
                            // Manually trigger the global recalculation effect logic
                            form.trigger("items");
                          }} /></FormControl></FormItem>
                        )} />
                        <FormField control={form.control} name={`items.${index}.discountType`} render={({ field }) => (
                          <FormItem>
                            <FormLabel>Type</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || "fixed"}>
                              <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                              <SelectContent><SelectItem value="fixed">Fixed</SelectItem><SelectItem value="percentage">%</SelectItem></SelectContent>
                            </Select>
                          </FormItem>
                        )} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <Card>
                  <CardHeader><CardTitle>Additional Information</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <FormField control={form.control} name="invoice.description" render={({ field }) => (
                      <FormItem><FormLabel>Description / Comments</FormLabel><FormControl><Textarea {...field} className="min-h-[120px]" placeholder="Project details, payment terms, etc." value={field.value || ""} /></FormControl></FormItem>
                    )} />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>Deposit Request</CardTitle></CardHeader>
                  <CardContent className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="invoice.depositValue" render={({ field }) => (
                      <FormItem><FormLabel>Deposit Value</FormLabel><FormControl><Input type="number" {...field} value={field.value || ""} onChange={(e) => { 
                        field.onChange(e.target.value); 
                        form.trigger("invoice.depositValue"); 
                      }} /></FormControl></FormItem>
                    )} />
                    <FormField control={form.control} name="invoice.depositType" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || "fixed"}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent><SelectItem value="fixed">Fixed</SelectItem><SelectItem value="percentage">%</SelectItem></SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>Payment Received</CardTitle></CardHeader>
                  <CardContent>
                    <FormField control={form.control} name="invoice.paidAmount" render={({ field }) => (
                      <FormItem><FormLabel>Paid Amount (Manual Entry)</FormLabel><FormControl><Input type="number" {...field} value={field.value || ""} /></FormControl></FormItem>
                    )} />
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-4">
                <Card className="border-blue-200">
                  <CardContent className="p-6 space-y-4">
                    <div className="flex justify-between text-sm"><span>Subtotal</span><span>{form.watch("invoice.subtotal")}</span></div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs text-slate-500">Subtotal Discount</label>
                        <div className="flex gap-2">
                          <Input 
                            type="number" 
                            {...form.register("invoice.subtotalDiscountValue")} 
                            onChange={(e) => {
                              form.setValue("invoice.subtotalDiscountValue", e.target.value);
                              recalculateTotals();
                            }}
                            className="h-8" 
                          />
                          <select 
                            {...form.register("invoice.subtotalDiscountType")} 
                            onChange={(e) => {
                              form.setValue("invoice.subtotalDiscountType", e.target.value);
                              recalculateTotals();
                            }}
                            className="h-8 rounded-md border text-xs"
                          >
                            <option value="fixed">Fixed</option>
                            <option value="percentage">%</option>
                          </select>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-slate-500">Sales Tax</label>
                        <div className="flex gap-2">
                          <Input 
                            type="number" 
                            {...form.register("invoice.taxValue")} 
                            onChange={(e) => {
                              form.setValue("invoice.taxValue", e.target.value);
                              recalculateTotals();
                            }}
                            className="h-8" 
                          />
                          <select 
                            {...form.register("invoice.taxType")} 
                            onChange={(e) => {
                              form.setValue("invoice.taxType", e.target.value);
                              recalculateTotals();
                            }}
                            className="h-8 rounded-md border text-xs"
                          >
                            <option value="fixed">Fixed</option>
                            <option value="percentage">%</option>
                          </select>
                        </div>
                      </div>
                    </div>
                    <div className="pt-4 border-t flex justify-between items-center">
                      <span className="text-xl font-bold text-blue-600">Total Amount</span>
                      <span className="text-2xl font-bold">{form.watch("invoice.currency")} {form.watch("invoice.totalAmount")}</span>
                    </div>

                    {parseFloat(String(form.watch("invoice.depositRequested"))) > 0 && (
                      <div className="bg-blue-50 p-4 rounded-md space-y-2 border border-blue-100">
                        <div className="flex justify-between text-sm"><span>Deposit Requested</span><span className="font-semibold text-blue-700">{form.watch("invoice.depositRequested")}</span></div>
                        <div className="flex justify-between text-sm"><span>Payable After Deposit</span><span className="font-semibold">{form.watch("invoice.payableAfterDeposit")}</span></div>
                      </div>
                    )}

                    {parseFloat(String(form.watch("invoice.paidAmount"))) > 0 && (
                      <div className="bg-emerald-50 p-4 rounded-md space-y-2 border border-emerald-100">
                        <div className="flex justify-between text-sm"><span>Paid Amount</span><span className="font-semibold text-emerald-700">{form.watch("invoice.paidAmount")}</span></div>
                        <div className="flex justify-between text-sm font-bold"><span>Payable Amount</span><span>{form.watch("invoice.payableAmount")}</span></div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
