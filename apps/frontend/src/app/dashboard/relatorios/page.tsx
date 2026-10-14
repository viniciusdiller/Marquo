import Form from "next/form";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { getGeneralBalanceReport } from "./actions";
import { DateTime } from "luxon";
import { brl } from "@/lib/money";

type PageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function ReportsPage(props: PageProps) {
  const searchParams = await props.searchParams;

  const today = DateTime.local().setZone("America/Sao_Paulo");
  const firstDayOfMonth = today.startOf("month");

  const startDate = typeof searchParams.startDate === "string" ? searchParams.startDate : firstDayOfMonth.toISODate()!;
  const endDate = typeof searchParams.endDate === "string" ? searchParams.endDate : today.toISODate()!;

  const startISO = DateTime.fromISO(startDate, { zone: "America/Sao_Paulo" }).startOf("day").toUTC().toISO()!;
  const endISO = DateTime.fromISO(endDate, { zone: "America/Sao_Paulo" }).endOf("day").toUTC().toISO()!;

  const report = await getGeneralBalanceReport(startISO, endISO);

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title="Relatórios"
        description="Acompanhe o faturamento e desempenho operacional de forma simples e direta."
      />

      <div className="mt-6 grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
        <div className="flex flex-col gap-6 lg:col-span-4 xl:col-span-3">
          <Form action="/dashboard/relatorios" className="flex flex-col gap-4 rounded-xl border border-zinc-200 p-4 dark:border-white/10">
            <Input
              name="startDate"
              type="date"
              label="Data inicial"
              defaultValue={startDate}
              required
            />
            <Input
              name="endDate"
              type="date"
              label="Data final"
              defaultValue={endDate}
              required
            />
            <Button type="submit" className="w-full">
              Filtrar Período
            </Button>
          </Form>
        </div>

        <div className="flex min-w-0 flex-col gap-8 lg:col-span-8 xl:col-span-9">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Faturamento</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <Card
                label="Faturamento Total"
                value={brl(report.totalRevenueCents)}
              />
              <Card
                label="Ticket Médio"
                value={brl(report.averageTicketCents)}
                tone="muted"
              />
              <Card
                label="Comandas Concluídas"
                value={report.totalTickets.toString()}
                tone="muted"
              />
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Operacional e Vendas</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card
                label="Total de Serviços"
                value={report.totalServices.toString()}
                tone="muted"
              />
              <Card
                label="Total de Produtos"
                value={report.totalProducts.toString()}
                tone="muted"
              />
              <Card
                label="Serviço Mais Pedido"
                value={report.mostRequestedService?.count?.toString() || "0"}
                hint={report.mostRequestedService?.name || "Nenhum"}
                tone="muted"
              />
              <Card
                label="Produto Mais Vendido"
                value={report.mostSoldProduct?.count?.toString() || "0"}
                hint={report.mostSoldProduct?.name || "Nenhum"}
                tone="muted"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
