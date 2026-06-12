import { useQuery } from "@tanstack/react-query";

export interface DashboardStats {
  totalSales: number;
  totalInvoices: number;
  totalReceivables: number;
  totalQuotes: number;
}

export function useDashboardStats(month?: number, year?: number, currency?: string) {
  const params = new URLSearchParams();
  if (month !== undefined && month !== -1) params.append("month", month.toString());
  if (year !== undefined) params.append("year", year.toString());
  if (currency) params.append("currency", currency);

  const paramStr = params.toString();
  const url = `/api/stats${paramStr ? `?${paramStr}` : ""}`;

  return useQuery<DashboardStats>({
    queryKey: [url],
  });
}
