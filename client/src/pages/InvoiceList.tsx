import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type Invoice, type InvoiceRequest } from "@shared/schema";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, FileText, Edit, Eye, Clock, CheckCircle, XCircle, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// ── Supabase Config ───────────────────────────────────────────────
const SUPABASE_URL = "https://dbyrmttpkeftcgcdneas.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRieXJtdHRwa2VmdGNnY2RuZWFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NTY1NzcsImV4cCI6MjA5NjMzMjU3N30.ipTjwyyRakLK8Ac9n7TXh-5bQp3tXlOsktcs6bE5mxI";
const SUPABASE_HEADERS = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
};

async function fetchSupabaseRequests(): Promise<InvoiceRequest[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/invoice_requests?order=created_at.desc`,
    { headers: SUPABASE_HEADERS }
  );
  if (!res.ok) throw new Error("Supabase fetch failed");
  const data = await res.json();
  return data.map((r: any) => ({
    id: r.id,
    clientName:  r.client_name  || "",
    clientEmail: r.client_email || "",
    clientPhone: r.client_phone || "",
    serviceName: r.service_name || "",
    price:       r.price        || "",
    message:     r.message      || "",
    status:      r.status       || "pending",
    createdAt:   r.created_at   ? new Date(r.created_at) : new Date(),
  }));
}

async function updateSupabaseStatus(id: string, status: string) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/invoice_requests?id=eq.${id}`,
    {
      method: "PATCH",
      headers: { ...SUPABASE_HEADERS, "Prefer": "return=minimal" },
      body: JSON.stringify({ status }),
    }
  );
  if (!res.ok) throw new Error("Supabase update failed");
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(" ");
}

export default function InvoiceList() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Read tab from URL query param
  const urlParams = new URLSearchParams(window.location.search);
  const defaultTab = urlParams.get("tab") === "pending" ? "pending" : "invoices";
  const [activeTab, setActiveTab] = useState<"invoices" | "pending">(defaultTab);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const { data: invoices, isLoading: loadingInvoices } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
  });

  const { data: pendingRequests = [], isLoading: loadingPending, refetch: refetchRequests } = useQuery<InvoiceRequest[]>({
    queryKey: ["supabase-invoice-requests"],
    queryFn: fetchSupabaseRequests,
    refetchInterval: 15000,
  });

  const pendingCount = pendingRequests.filter(r => r.status === "pending").length;

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/invoices/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Invoice Deleted", description: "The invoice has been removed." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const handleAccept = async (req: InvoiceRequest) => {
    setActionLoading(`accept-${req.id}`);
    try {
      // 1. Parse price — handle "Rs. 31,600/mo", "28,000", "$500", "31600" etc.
      //    Strategy: remove currency symbols, spaces, slashes and anything after slash,
      //    then remove commas, then parse as float.
      const rawPrice = String(req.price || "0");
      // Remove everything after "/" (e.g. "/mo", "/month")
      const withoutSlash = rawPrice.split("/")[0];
      // Remove all non-numeric characters except dot
      const cleanPrice = withoutSlash.replace(/[^0-9.]/g, "");
      const priceNum = parseFloat(cleanPrice) || 0;

      // 2. Get next invoice number from localStorage (no DB call needed)
      const storedInvoicesForNum = JSON.parse(localStorage.getItem("invoices") || "[]");
      const maxNum = storedInvoicesForNum.reduce((max: number, inv: any) => {
        const n = parseInt(inv.invoiceNumber || inv.id || 0);
        return n > max ? n : max;
      }, 1000);
      const nextNumber = maxNum + 1;

      // 3. Calculate totals
      const priceStr = priceNum.toFixed(2);

      // 4. Build invoice
      const now = new Date().toISOString();
      const due = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const newInvoice = {
        id:                     nextNumber,
        invoiceNumber:          nextNumber,
        currency:               "PKR",
        issueDate:              now,
        dueDate:                due,
        clientName:             req.clientName   || "Unknown",
        clientEmail:            req.clientEmail  || "",
        clientPhone:            req.clientPhone  || "",
        subtotal:               priceStr,
        subtotalDiscountValue:  "0",
        subtotalDiscountType:   "fixed",
        taxValue:               "0",
        taxType:                "fixed",
        totalAmount:            priceStr,
        depositType:            "fixed",
        depositValue:           "0",
        depositRequested:       "0.00",
        payableAfterDeposit:    priceStr,
        paidAmount:             "0",
        payableAmount:          priceStr,
        description:            req.message || "",
        status:                 "Unpaid",
        items: [{
          title:         req.serviceName || "Service",
          description:   req.message    || "",
          price:         priceStr,
          discountValue: "0",
          discountType:  "fixed",
          total:         priceStr,
        }],
      };

      // 5. Save to localStorage (for preview)
      const storedInvoices = JSON.parse(localStorage.getItem("invoices") || "[]");
      localStorage.setItem("invoices", JSON.stringify([...storedInvoices, newInvoice]));

      // 6. Mark as accepted in Supabase
      await updateSupabaseStatus(String(req.id), "accepted");

      // 7. Refresh queries
      queryClient.invalidateQueries({ queryKey: ["supabase-invoice-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });

      toast({
        title: "✅ Invoice Generated",
        description: `Invoice #${nextNumber} created for ${req.clientName}.`,
      });

      // 8. Go to preview — CreateInvoice will load from localStorage
      setLocation(`/invoices/${nextNumber}/preview`);

    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDecline = async (req: InvoiceRequest) => {
    setActionLoading(`decline-${req.id}`);
    try {
      await updateSupabaseStatus(String(req.id), "declined");
      queryClient.invalidateQueries({ queryKey: ["supabase-invoice-requests"] });
      toast({ title: "Request Declined", description: `Request from ${req.clientName} declined.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const formatCurrency = (val?: string | number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(Number(val) || 0);
  };

  return (
    <div className="container mx-auto py-10 px-4 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Invoices</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border">
        <button
          onClick={() => setActiveTab("invoices")}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
            activeTab === "invoices"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          All Invoices
        </button>
        <button
          onClick={() => setActiveTab("pending")}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors relative flex items-center gap-2",
            activeTab === "pending"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Pending Requests
          {pendingCount > 0 && (
            <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold bg-red-500 text-white rounded-full">
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {/* ── PENDING REQUESTS TAB ─────────────────────────────── */}
      {activeTab === "pending" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchRequests()}
              disabled={loadingPending}
            >
              <RefreshCw className={cn("h-4 w-4 mr-2", loadingPending && "animate-spin")} />
              Refresh
            </Button>
          </div>

          {loadingPending && (
            <div className="space-y-3">
              {[1, 2].map(n => (
                <Card key={n}>
                  <CardContent className="p-5">
                    <div className="animate-pulse flex gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-muted rounded w-1/3" />
                        <div className="h-3 bg-muted rounded w-1/4" />
                        <div className="h-3 bg-muted rounded w-1/2" />
                      </div>
                      <div className="space-y-2 w-20">
                        <div className="h-8 bg-muted rounded" />
                        <div className="h-8 bg-muted rounded" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {!loadingPending && pendingCount === 0 && (
            <Card>
              <CardContent className="py-16 text-center">
                <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-muted-foreground">No pending requests</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  New invoice requests will appear here for your approval
                </p>
              </CardContent>
            </Card>
          )}

          {!loadingPending && pendingRequests.filter(r => r.status === "pending").map((req) => (
            <Card key={req.id} className="border-amber-200">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-base">{req.clientName}</p>
                      <Badge className="bg-amber-100 text-amber-800 shrink-0">Pending</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{req.clientEmail}</p>
                    {req.clientPhone && (
                      <p className="text-sm text-muted-foreground">{req.clientPhone}</p>
                    )}
                    <p className="text-sm font-medium text-primary mt-1">{req.serviceName}</p>
                    {req.price && (
                      <p className="text-sm text-muted-foreground">Budget: {req.price}</p>
                    )}
                    {req.message && (
                      <p className="text-sm text-muted-foreground mt-1 italic">"{req.message}"</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">
                      Received: {req.createdAt ? format(new Date(req.createdAt), "MMM d, yyyy · h:mm a") : "—"}
                    </p>
                  </div>

                  <div className="flex flex-col gap-2 shrink-0">
                    <Button
                      size="sm"
                      onClick={() => handleAccept(req)}
                      disabled={actionLoading !== null}
                      className="gap-1.5"
                    >
                      {actionLoading === `accept-${req.id}`
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <CheckCircle className="h-4 w-4" />
                      }
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDecline(req)}
                      disabled={actionLoading !== null}
                      className="gap-1.5 text-destructive border-destructive hover:bg-destructive hover:text-white"
                    >
                      {actionLoading === `decline-${req.id}`
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <XCircle className="h-4 w-4" />
                      }
                      Decline
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Show accepted/declined history */}
          {!loadingPending && pendingRequests.filter(r => r.status !== "pending").length > 0 && (
            <div className="mt-6">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">History</p>
              <div className="space-y-2">
                {pendingRequests.filter(r => r.status !== "pending").map(req => (
                  <Card key={req.id} className="opacity-60">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">{req.clientName} — {req.serviceName}</p>
                          <p className="text-xs text-muted-foreground">{req.clientEmail}</p>
                        </div>
                        <Badge className={req.status === "accepted"
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                        }>
                          {req.status === "accepted" ? "Accepted" : "Declined"}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ALL INVOICES TAB ─────────────────────────────────── */}
      {activeTab === "invoices" && (
        <>
          {loadingInvoices ? (
            <div className="animate-pulse space-y-4">
              <div className="h-8 w-48 bg-muted rounded"></div>
              <div className="h-64 bg-muted rounded"></div>
            </div>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  All Invoices
                </CardTitle>
                <CardDescription>{invoices?.length ?? 0} invoice(s) total</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Total Amount</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices?.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="h-24 text-center">
                            No invoices found.
                          </TableCell>
                        </TableRow>
                      ) : (
                        invoices?.map((invoice) => (
                          <TableRow key={invoice.id}>
                            <TableCell className="font-medium">#{invoice.invoiceNumber}</TableCell>
                            <TableCell>{invoice.clientName}</TableCell>
                            <TableCell>{format(new Date(invoice.issueDate), "MMM d, yyyy")}</TableCell>
                            <TableCell>
                              <span className={cn(
                                "px-2 py-1 rounded-full text-xs font-medium",
                                invoice.status.toLowerCase() === 'paid'
                                  ? "bg-emerald-100 text-emerald-700"
                                  : invoice.status.toLowerCase() === 'partial'
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-amber-100 text-amber-700"
                              )}>
                                {invoice.status}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">{formatCurrency(invoice.totalAmount)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="icon" onClick={() => setLocation(`/invoices/${invoice.id}/preview`)}>
                                  <Eye className="h-4 w-4 text-slate-600" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => setLocation(`/invoices/${invoice.id}/edit`)}>
                                  <Edit className="h-4 w-4 text-blue-600" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    if (confirm(`Invoice #${invoice.invoiceNumber} delete karna chahte hain?`)) {
                                      deleteMutation.mutate(invoice.id);
                                    }
                                  }}
                                  disabled={deleteMutation.isPending}
                                >
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
