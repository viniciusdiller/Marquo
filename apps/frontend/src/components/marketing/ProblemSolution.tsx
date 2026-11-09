import { ChatsCircle, Receipt, UserCircleMinus } from "@phosphor-icons/react/dist/ssr";
import { Container } from "../ui/Container";
import { Reveal } from "../ui/Reveal";
import { BrandPattern } from "../brand/BrandPattern";

const pains = [
  {
    icon: ChatsCircle,
    title: "O pingue-pongue de mensagens",
    body: "Trocar 10 mensagens no WhatsApp para fechar um único corte enquanto você está com cliente na cadeira. Se demorar 20 minutos para responder, o cliente já agendou no concorrente.",
  },
  {
    icon: UserCircleMinus,
    title: "Cadeiras vazias e faltas sem aviso",
    body: "O cliente marca na conversa, esquece e não aparece. Sem lembrete automático e sem lista de espera, aquele horário vira prejuízo imediato.",
  },
  {
    icon: Receipt,
    title: "Fim do dia somando fichas no papel",
    body: "Fechar o caixa, conferir comanda por comanda e calcular a porcentagem de cada profissional não deveria ser uma segunda jornada de trabalho.",
  },
];

export function ProblemSolution() {
  return (
    <section className="relative isolate overflow-hidden py-20 lg:py-28">
      <BrandPattern mask="radial-gradient(ellipse 45% 55% at 0% 100%, black 0%, transparent 70%)" />
      <Container>
        <Reveal>
          <h2 className="max-w-2xl font-display text-3xl font-bold tracking-tight text-zinc-900 md:text-4xl dark:text-white">
            Você não deveria ter que parar de atender para responder se tem horário livre
          </h2>
        </Reveal>

        <div className="mt-14 grid gap-x-8 gap-y-10 md:grid-cols-3">
          {pains.map((pain, i) => (
            <Reveal key={pain.title} delay={i * 0.08}>
              <pain.icon size={28} weight="light" className="text-accent-500" />
              <h3 className="mt-4 font-display text-lg font-semibold text-zinc-900 dark:text-white">
                {pain.title}
              </h3>
              <p className="mt-2 text-[15px] leading-relaxed text-zinc-600 dark:text-stone-300">
                {pain.body}
              </p>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
