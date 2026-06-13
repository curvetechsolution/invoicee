import { useState } from "react";
import { useDashboardStats } from "@/hooks/use-dashboard";
import { StatCard } from "@/components/StatCard";
import { ActionButton } from "@/components/ActionButton";
import { DollarSign, FileText, Receipt, Send, Plus, Calendar, Bell, CheckCircle, XCircle, Loader2, Clock } from "lucide-react";
import logoImg from "@assets/Curve_Tech_Solution_Logo_1767002702612.png";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type InvoiceRequest } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { format } from "date-fns";

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
    `${SUPABASE_URL}/rest/v1/invoice_requests?status=eq.pending&order=created_at.desc`,
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



const CURRENCIES = [
  { code: "USD", symbol: "$" },
  { code: "GBP", symbol: "£" },
  { code: "PKR", symbol: "Rs" },
  { code: "EUR", symbol: "€" },
];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export default function Home() {
  const [, setLocation] = useLocation();
  const [selectedCurrency, setSelectedCurrency] = useState(CURRENCIES[0]);
  const [selectedMonth, setSelectedMonth] = useState<string>("-1");
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const { data: stats, isLoading } = useDashboardStats(
    parseInt(selectedMonth),
    parseInt(selectedYear),
    selectedCurrency.code
  );
  const { toast } = useToast();

  // Pending invoice requests — from Supabase
  const { data: allRequests = [], refetch: refetchRequests } = useQuery<InvoiceRequest[]>({
    queryKey: ["supabase-invoice-requests"],
    queryFn: fetchSupabaseRequests,
    refetchInterval: 30000,
  });

  const pendingRequests = allRequests.filter(r => r.status === "pending");
  const pendingCount = pendingRequests.length;

  // ── Accept ──────────────────────────────────────────────────────
  const handleAccept = async (req: InvoiceRequest) => {
    setActionLoading(`accept-${req.id}`);
    try {
      await updateSupabaseStatus(String(req.id), "accepted");
      queryClient.invalidateQueries({ queryKey: ["supabase-invoice-requests"] });
      toast({ title: "✅ Request Accepted", description: `Request from ${req.clientName} accepted.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  // ── Decline ─────────────────────────────────────────────────────
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

  const formatCurrency = (val?: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: selectedCurrency.code,
      minimumFractionDigits: 0,
    }).format(val || 0);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-12 h-12 bg-primary/20 rounded-full"></div>
          <div className="text-muted-foreground font-medium">Loading Dashboard...</div>
        </div>
      </div>
    );
  }

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => (currentYear - 2 + i).toString());

  return (
    <div className="min-h-screen bg-background font-sans selection:bg-primary/20">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg overflow-hidden bg-white shadow-sm border border-border/20">
              <img src={logoImg} alt="Curve Tech Logo" className="w-full h-full object-contain p-1" />
            </div>
            <h1 className="text-xl font-bold font-display tracking-tight text-foreground">
              Curve Tech Solution
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <Select
              value={selectedCurrency.code}
              onValueChange={(val) => setSelectedCurrency(CURRENCIES.find(c => c.code === val) || CURRENCIES[0])}
            >
              <SelectTrigger className="w-[80px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map(c => (
                  <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Bell — goes to invoices pending tab */}
            <button
              onClick={() => setLocation("/invoices?tab=pending")}
              className="relative w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
              title="Pending Invoice Requests"
            >
              <Bell className="w-4 h-4 text-slate-600" />
              {pendingCount > 0 && (
                <span className="absolute -top-1 -right-1 inline-flex items-center justify-center w-5 h-5 text-xs font-bold bg-red-500 text-white rounded-full animate-pulse">
                  {pendingCount}
                </span>
              )}
            </button>

            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
              CT
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">

        {/* Welcome Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 animate-in fade-in-up">
          <div>
            <h2 className="text-3xl font-bold font-display text-foreground">Dashboard Overview</h2>
            <p className="text-muted-foreground mt-2">Welcome back. Here's what's happening today.</p>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-[130px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="-1">All Months</SelectItem>
                {MONTHS.map((m, i) => (
                  <SelectItem key={m} value={i.toString()}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-[90px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map(y => (
                  <SelectItem key={y} value={y}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ── STATS GRID ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            title="Total Sales"
            value={formatCurrency(stats?.totalSales)}
            icon={DollarSign}
            delay="delay-0"
            className="border-l-4 border-l-emerald-500"
          />
          <StatCard
            title="Issued Invoices"
            value={stats?.totalInvoices || 0}
            icon={FileText}
            delay="delay-100"
            className="border-l-4 border-l-blue-500"
            onClick={() => setLocation("/invoices")}
          />
          <StatCard
            title="Receivable Amount"
            value={formatCurrency(stats?.totalReceivables)}
            icon={Receipt}
            delay="delay-200"
            className="border-l-4 border-l-amber-500"
          />
          <StatCard
            title="Quotations Issued"
            value={stats?.totalQuotes || 0}
            icon={Send}
            delay="delay-300"
            className="border-l-4 border-l-purple-500"
          />
        </div>

        {/* ── PENDING INVOICE REQUESTS (Always Visible) ──────────── */}
        <Card className="border-amber-200 dark:border-amber-800">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="h-4 w-4 text-amber-500" />
                Pending Invoice Requests
                {pendingCount > 0 && (
                  <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold bg-red-500 text-white rounded-full animate-pulse">
                    {pendingCount}
                  </span>
                )}
              </CardTitle>
              <button
                onClick={() => refetchRequests()}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted"
              >
                ↻ Refresh
              </button>
            </div>
            <CardDescription>
              Requests from package.curvetechsolution.online — accept to auto-generate invoice or decline to dismiss
            </CardDescription>
          </CardHeader>

          <CardContent>
            {pendingCount === 0 && (
              <div className="text-center py-10 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-dashed border-amber-200 dark:border-amber-800">
                <Clock className="h-10 w-10 mx-auto mb-3 opacity-30 text-amber-400" />
                <p className="text-sm font-medium text-muted-foreground">No pending requests</p>
                <p className="text-xs mt-1 text-muted-foreground opacity-70">
                  New requests from your package site will appear here in real time
                </p>
              </div>
            )}

            {pendingCount > 0 && (
              <div className="space-y-3">
                {pendingRequests.map(req => (
                  <div
                    key={req.id}
                    className="flex items-start justify-between gap-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-800 rounded-xl p-4 hover:border-amber-300 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="font-semibold text-sm">{req.clientName}</p>
                        <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 text-xs px-2 py-0">
                          pending
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{req.clientEmail}</p>
                      {req.clientPhone && (
                        <p className="text-xs text-muted-foreground">{req.clientPhone}</p>
                      )}
                      <p className="text-xs font-semibold text-primary mt-1">{req.serviceName}</p>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        {req.price && (
                          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                            💰 {req.price}
                          </span>
                        )}
                      </div>
                      {req.message && (
                        <p className="text-xs text-muted-foreground mt-1 italic">"{req.message}"</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1.5">
                        🕐 {req.createdAt
                          ? format(new Date(req.createdAt), "MMM d, yyyy · h:mm a")
                          : "—"
                        }
                      </p>
                    </div>

                    <div className="flex flex-col gap-2 shrink-0">
                      <Button
                        size="sm"
                        className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                        disabled={actionLoading !== null}
                        onClick={() => handleAccept(req)}
                      >
                        {actionLoading === `accept-${req.id}`
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <CheckCircle className="h-3 w-3" />
                        }
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs gap-1.5 text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-950"
                        disabled={actionLoading !== null}
                        onClick={() => handleDecline(req)}
                      >
                        {actionLoading === `decline-${req.id}`
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <XCircle className="h-3 w-3" />
                        }
                        Decline
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── ACTION BUTTONS ─────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <ActionButton onClick={() => setLocation("/invoices/new")} icon={<Plus className="w-8 h-8" />}>
            Create New Invoice
          </ActionButton>
          <ActionButton
            onClick={() => toast({ title: "Coming Soon", description: "Quote creation will be available in the next update." })}
            icon={<FileText className="w-8 h-8" />}
          >
            Create New Quote
          </ActionButton>
        </div>

      </main>
    </div>
  );
}
