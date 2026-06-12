import { useState } from "react";
import { useDashboardStats } from "@/hooks/use-dashboard";
import { StatCard } from "@/components/StatCard";
import { ActionButton } from "@/components/ActionButton";
import { DollarSign, FileText, Receipt, Send, Plus, Calendar, Bell } from "lucide-react";
import logoImg from "@assets/Curve_Tech_Solution_Logo_1767002702612.png";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { type InvoiceRequest } from "@shared/schema";

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
  
  const { data: stats, isLoading } = useDashboardStats(
    parseInt(selectedMonth), 
    parseInt(selectedYear),
    selectedCurrency.code
  );
  const { toast } = useToast();

  // Pending invoice requests
  const { data: pendingRequests = [] } = useQuery<InvoiceRequest[]>({
    queryKey: ["/api/invoice-requests"],
    refetchInterval: 30000, // auto-refresh every 30s
  });
  const pendingCount = pendingRequests.filter(r => r.status === "pending").length;

  const handleCreateInvoice = () => {
    setLocation("/invoices/new");
  };

  const handleCreateQuote = () => {
    toast({
      title: "Coming Soon",
      description: "Quote creation will be available in the next update.",
    });
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

             {/* 🔔 Pending Requests Bell */}
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
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

        {/* Pending Requests Banner */}
        {pendingCount > 0 && (
          <div
            onClick={() => setLocation("/invoices?tab=pending")}
            className="cursor-pointer flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 hover:bg-amber-100 transition-colors"
          >
            <div className="relative shrink-0">
              <Bell className="w-5 h-5 text-amber-600" />
              <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold bg-red-500 text-white rounded-full">
                {pendingCount}
              </span>
            </div>
            <div className="flex-1">
              <p className="font-semibold text-amber-900 text-sm">
                {pendingCount} Pending Invoice Request{pendingCount > 1 ? "s" : ""}
              </p>
              <p className="text-amber-700 text-xs mt-0.5">
                New requests from package.curvetechsolution.online are waiting for your review
              </p>
            </div>
            <span className="text-xs font-medium text-amber-700 bg-amber-200 px-3 py-1 rounded-full shrink-0">
              Review Now →
            </span>
          </div>
        )}

        {/* Stats Grid */}
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

        {/* Action Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
          <ActionButton onClick={handleCreateInvoice} icon={<Plus className="w-8 h-8" />}>
            Create New Invoice
          </ActionButton>
          
          <ActionButton onClick={handleCreateQuote} icon={<FileText className="w-8 h-8" />}>
            Create New Quote
          </ActionButton>
        </div>
      </main>
    </div>
  );
}
