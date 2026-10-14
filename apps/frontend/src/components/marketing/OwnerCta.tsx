import { CalendarCheck, LinkSimple, TrendUp } from "@phosphor-icons/react/dist/ssr";
import { Container } from "../ui/Container";
import { Reveal } from "../ui/Reveal";
import { Button } from "../ui/Button";
import { BrandPattern } from "../brand/BrandPattern";

// Faixa full-bleed (quebra o Container de propósito) — mesmo papel do bloco laranja do
// Trinks: o ponto da home onde o dono de salão, não o cliente final, é o público.
export function OwnerCta() {
  return (
    <section className="relative isolate overflow-hidden bg-accent-500 py-20 lg:py-24">
      <BrandPattern tone="purple" mask="linear-gradient(to left, black, transparent 70%)" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,_var(--tw-gradient-stops))] from-white/10 via-transparent to-transparent"
      />
      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-8">
          <Reveal>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold tracking-wide text-white uppercase">
              <TrendUp size={14} weight="bold" />
              Para donos de salão
            </span>
            <h2 className="mt-5 font-display text-3xl font-bold tracking-tight text-balance text-white md:text-4xl">
              Quer ser encontrado por quem já está procurando um salão?
            </h2>
            <p className="mt-4 max-w-[48ch] text-[15px] leading-relaxed text-accent-50">
              Cadastre seu negócio no Marquo, apareça na busca acima e
              comece a receber agendamento direto pelo seu link — sem
              trocar mensagem. Teste grátis por 14 dias, sem cartão.
            </p>
            <div className="mt-8">
              <Button href="/cadastro" variant="secondary" className="bg-white text-accent-700 hover:bg-accent-50">
                Quero fazer parte
              </Button>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="relative mx-auto w-full max-w-xs rounded-2xl bg-white p-5 shadow-2xl shadow-zinc-900/20">
              <div className="flex items-center gap-2 rounded-xl bg-zinc-100 px-3 py-2.5 text-xs font-medium text-zinc-600 dark:bg-zinc-100">
                <LinkSimple size={14} />
                marquo.com.br/<span className="text-accent-600">seu-salao</span>
              </div>
              <div className="mt-4 flex items-center gap-2 text-accent-600">
                <CalendarCheck size={18} weight="fill" />
                <span className="text-sm font-semibold text-zinc-900">Agenda de hoje</span>
              </div>
              <ul className="mt-3 flex flex-col gap-2">
                {[
                  ["09:00", "Corte + Barba", "Carlos"],
                  ["10:30", "Coloração", "Ana"],
                  ["14:00", "Manicure", "Júlia"],
                ].map(([time, service, pro]) => (
                  <li
                    key={time}
                    className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-700"
                  >
                    <span className="font-semibold text-zinc-900">{time}</span>
                    <span className="text-zinc-500">{service}</span>
                    <span className="font-medium text-accent-600">{pro}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
