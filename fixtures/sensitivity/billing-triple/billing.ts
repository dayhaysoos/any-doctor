import { query } from "../_generated/server";

// The audit's billing.ts shape: three IDENTICAL query chains in three
// separate functions of one file. The 0.0.6-era dedup keyed on normalized
// statement text collapsed them to one finding; chain-start line is the
// correct key. All three must be reported.
export async function scanOpenInvoices(ctx: any, tenantId: string) {
  const rows = await ctx.db
    .query("invoices")
    .withIndex("by_tenant_status")
    .filter((q: any) => q.eq(q.field("tenantId"), tenantId))
    .collect();
  return rows.filter((r: any) => r.status === "open");
}

export async function scanPaidInvoices(ctx: any, tenantId: string) {
  const rows = await ctx.db
    .query("invoices")
    .withIndex("by_tenant_status")
    .filter((q: any) => q.eq(q.field("tenantId"), tenantId))
    .collect();
  return rows.filter((r: any) => r.status === "paid");
}

export async function scanVoidInvoices(ctx: any, tenantId: string) {
  const rows = await ctx.db
    .query("invoices")
    .withIndex("by_tenant_status")
    .filter((q: any) => q.eq(q.field("tenantId"), tenantId))
    .collect();
  return rows.filter((r: any) => r.status === "void");
}
