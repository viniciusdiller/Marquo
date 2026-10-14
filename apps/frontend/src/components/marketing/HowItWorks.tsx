import { CalendarPlus, PaperPlaneTilt, UsersThree } from "@phosphor-icons/react/dist/ssr";
import { Container } from "../ui/Container";
import { Reveal } from "../ui/Reveal";
import { BrandPattern } from "../brand/BrandPattern";

const steps = [
  {
    icon: CalendarPlus,
    title: "Monte a agenda de cada profissional",
    body: "Cadastre serviços, preços e os horários em que cada profissional atende. Bloqueie folgas e almoço quando quiser.",
  },
  {
    icon: PaperPlaneTilt,
    title: "Compartilhe o link do seu negócio",
    body: "Todo negócio recebe um link próprio, tipo marquo.com.br/seu-salao, para colocar na bio do Instagram ou no status do WhatsApp.",
  },
  {
    icon: UsersThree,
    title: "Clientes marcam sozinhos",
    body: "Eles escolhem o serviço, o profissional e o horário livre, deixam nome e telefone, e pronto. Sem precisar criar conta.",
  },
];

export function HowItWorks() {
  return (
    <section id="como-funciona" className="relative isolate bg-white py-20 lg:py-28 dark:bg-zinc-900/40">
      <BrandPattern mask="radial-gradient(ellipse at bottom left, black 10%, transparent 70%)" className="right-auto hidden w-1/3 lg:block" />
      <Container>
        <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
          <Reveal>
            <h2 className="font-display text-3xl font-bold tracking-tight text-zinc-900 md:text-4xl dark:text-white">
              Como funciona
            </h2>
            <p className="mt-4 max-w-[42ch] text-[15px] leading-relaxed text-zinc-600 dark:text-stone-300">
              Três passos entre cadastrar seu negócio e ter clientes marcando
              horário sem precisar te chamar no privado.
            </p>
          </Reveal>

          <ol className="flex flex-col gap-10">
            {steps.map((step, i) => (
              <Reveal key={step.title} delay={i * 0.1}>
                <li className="flex gap-5">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent-50 text-accent-600 dark:bg-accent-500/10 dark:text-accent-300">
                    <step.icon size={24} weight="light" />
                  </div>
                  <div>
                    <h3 className="font-display text-lg font-semibold text-zinc-900 dark:text-white">
                      {step.title}
                    </h3>
                    <p className="mt-1.5 max-w-[52ch] text-[15px] leading-relaxed text-zinc-600 dark:text-stone-300">
                      {step.body}
                    </p>
                  </div>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </Container>
    </section>
  );
}
