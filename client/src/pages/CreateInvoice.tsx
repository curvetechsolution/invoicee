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
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8 print:p-0 print:bg-white">
        <div className="max-w-5xl mx-auto space-y-6 print:max-w-none print:m-0">
          <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 print:hidden">
            <div className="flex items-center gap-3">
              <Link href="/invoices">
                <Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button>
              </Link>
              <div className="flex items-center gap-2">
                <img src={logoImg} alt="Logo" className="w-8 h-8 sm:w-10 sm:h-10 object-contain" />
                <h1 className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-slate-50">Invoice Preview</h1>
              </div>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button variant="outline" className="flex-1 sm:flex-none text-sm" onClick={() => window.print()}>Print / Download PDF</Button>
              <Button className="flex-1 sm:flex-none text-sm" onClick={() => setLocation(`/invoices/${params?.id}/edit`)}>Edit Invoice</Button>
            </div>
          </header>

          <Card className="print:shadow-none print:border-none print:rounded-none">
            <CardContent className="p-4 sm:p-6 md:p-10 space-y-6 sm:space-y-8 print:p-8">
              {/* Professional 2-Column Header — stacks on mobile */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-12 items-start border-b pb-6 sm:pb-8 border-slate-200">
                <div className="space-y-4 sm:space-y-6">
                  <div className="flex items-center gap-3">
                    <img src={logoImg} alt="Logo" className="w-14 h-14 sm:w-20 sm:h-20 object-contain" />
                    <div>
                      <h2 className="text-lg sm:text-2xl font-black text-blue-700 tracking-tight leading-none">Curve Tech Solution</h2>
                      <p className="text-xs sm:text-sm font-medium text-slate-500 mt-1">Innovation in every curve</p>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="text-sm text-slate-600">
                      <p className="font-bold text-slate-900 mb-1">Contact Info</p>
                      <p>info@curvetechsolution.com</p>
                      <p>www.curvetechsolution.com</p>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-2">
                      <div className="text-xs">
                        <p className="font-bold text-slate-400 uppercase tracking-widest mb-1">USA Office</p>
                        <p className="text-slate-600">117 South Lexington Street, Ste 100, Harrisonville, MO 64701, USA</p>
                      </div>
                      <div className="text-xs">
                        <p className="font-bold text-slate-400 uppercase tracking-widest mb-1">Pakistan Office</p>
                        <p className="text-slate-600">Office No 4, First Floor, Tariq Business Center, Block H-3, Johar Town, Lahore, 54000</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:items-end sm:text-right">
                  <h2 className="text-3xl sm:text-5xl font-black text-slate-900 uppercase tracking-tighter mb-4 sm:mb-6">Invoice</h2>
                  
                  <div className="w-full sm:max-w-[280px] space-y-4">
                    <div className="grid grid-cols-2 gap-2 text-sm border-y py-3 border-slate-100">
                      <div className="text-slate-500 font-medium">Invoice #</div>
                      <div className="font-bold text-slate-900 sm:text-right">#{form.getValues("invoice.invoiceNumber")}</div>
                      
                      <div className="text-slate-500 font-medium">Issue Date</div>
                      <div className="text-slate-900 sm:text-right">{form.getValues("invoice.issueDate") ? format(new Date(form.getValues("invoice.issueDate") as any), "MMM d, yyyy") : ""}</div>
                      
                      <div className="text-slate-500 font-medium">Due Date</div>
                      <div className="font-bold text-blue-600 sm:text-right">{form.getValues("invoice.dueDate") ? format(new Date(form.getValues("invoice.dueDate") as any), "MMM d, yyyy") : ""}</div>
                    </div>

                    <div className="bg-slate-50 p-3 sm:p-4 rounded-lg text-left border border-slate-100">
                      <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Bill To</p>
                      <p className="text-base sm:text-lg font-bold text-slate-900 leading-tight">{form.getValues("invoice.clientName")}</p>
                      <p className="text-sm text-slate-600 mt-1">{form.getValues("invoice.clientEmail")}</p>
                      <p className="text-sm text-slate-600">{form.getValues("invoice.clientPhone")}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Items Table — scrollable on mobile, full on desktop */}
              <div className="border rounded-lg overflow-hidden border-slate-200">
                {/* Mobile card view */}
                <div className="block sm:hidden divide-y divide-slate-100">
                  {watchedItems.map((item, idx) => (
                    <div key={idx} className="p-4 space-y-2">
                      <p className="font-bold text-slate-900">{item.title}</p>
                      {item.description && <p className="text-xs text-slate-500 leading-relaxed">{item.description}</p>}
                      <div className="flex justify-between text-sm pt-1">
                        <span className="text-slate-500">Price</span>
                        <span className="font-medium text-slate-700">{form.getValues("invoice.currency")} {item.price}</span>
                      </div>
                      {item.discountValue && Number(item.discountValue) > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Discount</span>
                          <span className="text-emerald-600 font-medium">
                            {item.discountType === "percentage" ? `${item.discountValue}%` : `${form.getValues("invoice.currency")} ${item.discountValue}`}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm font-bold border-t pt-2 border-slate-100">
                        <span className="text-slate-700">Total</span>
                        <span className="text-slate-900">{form.getValues("invoice.currency")} {item.total}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Desktop table view */}
                <table className="hidden sm:table w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-900 border-b border-slate-200">
                      <th className="px-4 sm:px-6 py-4 text-left font-bold">Description</th>
                      <th className="px-4 sm:px-6 py-4 text-right font-bold w-28 sm:w-32">Price</th>
                      <th className="px-4 sm:px-6 py-4 text-right font-bold w-28 sm:w-32">Discount</th>
                      <th className="px-4 sm:px-6 py-4 text-right font-bold w-28 sm:w-32">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {watchedItems.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 sm:px-6 py-4">
                          <p className="font-bold text-slate-900">{item.title}</p>
                          <p className="text-slate-500 mt-0.5 leading-relaxed text-xs sm:text-sm">{item.description}</p>
                        </td>
                        <td className="px-4 sm:px-6 py-4 text-right font-medium text-slate-600">{form.getValues("invoice.currency")} {item.price}</td>
                        <td className="px-4 sm:px-6 py-4 text-right text-slate-500">
                          {item.discountValue && Number(item.discountValue) > 0 ? (
                            <span className="text-emerald-600 font-medium">
                              {item.discountType === "percentage" ? `${item.discountValue}%` : `${form.getValues("invoice.currency")} ${item.discountValue}`}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-4 sm:px-6 py-4 text-right font-bold text-slate-900">{form.getValues("invoice.currency")} {item.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals Section */}
              <div className="flex justify-end pt-4">
                <div className="w-full sm:max-w-sm space-y-4">
                  <div className="space-y-2.5 px-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500 font-medium">Subtotal</span>
                      <span className="font-bold text-slate-900">{form.getValues("invoice.currency")} {form.getValues("invoice.subtotal")}</span>
                    </div>

                    {Number(form.getValues("invoice.subtotalDiscountValue")) > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-emerald-600 font-medium">Discount ({form.getValues("invoice.subtotalDiscountType") === "percentage" ? `${form.getValues("invoice.subtotalDiscountValue")}%` : "Fixed"})</span>
                        <span className="font-bold text-emerald-600">-{form.getValues("invoice.currency")} {(Number(form.getValues("invoice.subtotal")) - Number(form.getValues("invoice.totalAmount"))).toFixed(2)}</span>
                      </div>
                    )}
                  </div>

                  <div className="bg-blue-700 text-white p-4 sm:p-6 rounded-xl shadow-lg shadow-blue-200 print:shadow-none">
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-blue-100 font-bold uppercase tracking-wider text-xs shrink-0">Total Amount Due</span>
                      <span className="text-2xl sm:text-3xl font-black text-right">{form.getValues("invoice.currency")} {form.getValues("invoice.totalAmount")}</span>
                    </div>
                  </div>

                  <div className="space-y-3 px-4 py-2">
                    {Number(form.getValues("invoice.depositRequested")) > 0 && Number(form.getValues("invoice.paidAmount")) === 0 && (
                      <div className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
                        <span className="text-sm font-bold text-slate-500">Required Deposit</span>
                        <span className="text-lg font-black text-slate-900">{form.getValues("invoice.currency")} {form.getValues("invoice.depositRequested")}</span>
                      </div>
                    )}

                    {Number(form.getValues("invoice.paidAmount")) > 0 && (
                      <div className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
                        <span className="text-sm font-bold text-emerald-600">Amount Already Paid</span>
                        <span className="text-lg font-black text-emerald-600">{form.getValues("invoice.currency")} {form.getValues("invoice.paidAmount")}</span>
                      </div>
                    )}

                    <div className="flex justify-between items-center pt-1">
                      <span className="text-base font-black text-blue-700 uppercase tracking-tight">Remaining Balance</span>
                      <span className="text-2xl font-black text-blue-700">{form.getValues("invoice.currency")} {form.getValues("invoice.payableAmount")}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Terms & Conditions Section */}
              {form.getValues("invoice.description") && (
                <div className="pt-12 mt-12 border-t border-slate-100 print:mt-8 print:pt-6">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Terms & Conditions</h3>
                  <div className="bg-slate-50/50 p-6 rounded-xl border border-slate-100 print:bg-white print:p-0 print:border-0">
                    <p className="text-xs text-slate-500 leading-relaxed whitespace-pre-wrap">
                      {form.getValues("invoice.description")}
                    </p>
                  </div>
                </div>
              )}
              
              {/* Footer */}
              <div className="text-center pt-12 text-slate-400 text-[10px] font-medium uppercase tracking-widest hidden print:block">
                Thank you for your business with Curve Tech Solution
              </div>
            </CardContent>
          </Card>
        </div>
        
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            body { background: white !important; }
            .print\\:shadow-none { box-shadow: none !important; }
            .print\\:border-none { border: none !important; }
            .print\\:rounded-none { border-radius: 0 !important; }
            @page { margin: 1.5cm; }
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
