import {
  Clock,
  HourglassMedium,
  LinkSimple,
  UserCircleMinus,
  UsersThree,
} from "@phosphor-icons/react/dist/ssr";
import { Container } from "../ui/Container";
import { Reveal } from "../ui/Reveal";
import { BrandPattern } from "../brand/BrandPattern";

export function Features() {
  return (
    <section id="recursos" className="relative isolate overflow-hidden py-20 lg:py-28">
      <BrandPattern mask="radial-gradient(ellipse 45% 55% at 100% 0%, black 0%, transparent 70%)" />
      <Container>
        <Reveal>
          <h2 className="max-w-lg font-display text-3xl font-bold tracking-tight text-zinc-900 md:text-4xl dark:text-white">
            Tudo que um salão ou barbearia precisa, nada que sobra
          </h2>
        </Reveal>

        <div className="mt-14 grid gap-4 md:grid-cols-3">
          <Reveal className="md:col-span-2">
            <div className="flex h-full flex-col justify-between overflow-hidden rounded-2xl bg-zinc-900 p-8 text-white">
              <div>
                <LinkSimple size={26} weight="light" className="text-accent-300" />
                <h3 className="mt-4 font-display text-xl font-semibold">
                  Um link só para o seu negócio
                </h3>
                <p className="mt-2 max-w-[38ch] text-[15px] leading-relaxed text-stone-300">
                  Gerado automaticamente a partir do nome do seu negócio.
                  Coloca na bio, no status, onde quiser.
                </p>
              </div>
              <div className="mt-10 flex items-center gap-2 rounded-xl bg-white/10 px-4 py-3 font-mono text-sm text-stone-100 ring-1 ring-white/10">
                marquo.com.br/
                <span className="text-accent-300">studio-da-ana</span>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.05}>
            <div className="flex h-full flex-col justify-between rounded-2xl bg-accent-50 p-6 dark:bg-accent-500/10">
              <UsersThree size={24} weight="light" className="text-accent-600 dark:text-accent-300" />
              <div>
                <h3 className="mt-4 font-display text-base font-semibold text-zinc-900 dark:text-white">
                  Agenda por profissional
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-stone-300">
                  Cada profissional define os próprios horários. Sem conflito
                  entre agendas.
                </p>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="flex h-full flex-col justify-between rounded-2xl border border-zinc-200 p-6 dark:border-white/10">
              <HourglassMedium size={24} weight="light" className="text-accent-500" />
              <div>
                <h3 className="mt-4 font-display text-base font-semibold text-zinc-900 dark:text-white">
                  Lista de espera
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-stone-300">
                  Sem horário livre? O cliente entra na fila e você entra em
                  contato quando abrir vaga.
                </p>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.15}>
            <div className="flex h-full flex-col justify-between rounded-2xl border border-zinc-200 p-6 dark:border-white/10">
              <UserCircleMinus size={24} weight="light" className="text-accent-500" />
              <div>
                <h3 className="mt-4 font-display text-base font-semibold text-zinc-900 dark:text-white">
                  Sem conta para o cliente
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-stone-300">
                  Só nome e telefone. Ninguém quer criar login para marcar um
                  corte de cabelo.
                </p>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.2}>
            <div className="flex h-full flex-col justify-between rounded-2xl bg-accent-50 p-6 dark:bg-accent-500/10">
              <Clock size={24} weight="light" className="text-accent-600 dark:text-accent-300" />
              <div>
                <h3 className="mt-4 font-display text-base font-semibold text-zinc-900 dark:text-white">
                  Cliente remarca sozinho
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-stone-300">
                  Cancelamento e reagendamento pelo mesmo link, sem precisar
                  te chamar.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
