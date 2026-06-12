import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import CreateInvoice from "@/pages/CreateInvoice";
import InvoiceList from "@/pages/InvoiceList";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/invoices" component={InvoiceList} />
      <Route path="/invoices/new" component={CreateInvoice} />
      <Route path="/invoices/:id/edit" component={CreateInvoice} />
      <Route path="/invoices/:id/preview" component={CreateInvoice} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Router />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
