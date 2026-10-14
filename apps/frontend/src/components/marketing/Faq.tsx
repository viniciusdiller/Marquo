import { Container } from "../ui/Container";
import { Reveal } from "../ui/Reveal";
import { AccordionItem } from "../ui/Accordion";
import { BrandPattern } from "../brand/BrandPattern";

const faqs = [
  {
    question: "Preciso de cartão de crédito para testar?",
    answer:
      "Não. Você usa qualquer plano por 14 dias sem informar cartão. Só pedimos os dados de pagamento quando você decidir continuar.",
  },
  {
    question: "O Marquo cobra alguma coisa do meu cliente?",
    answer:
      "Não. O pagamento do serviço continua sendo combinado direto entre você e o cliente, do jeito que já funciona hoje. Cobramos só a assinatura mensal do seu negócio.",
  },
  {
    question: "O cliente precisa criar uma conta para agendar?",
    answer:
      "Não. Ele acessa o link do seu negócio, escolhe o serviço, o profissional e o horário, e deixa só nome e telefone.",
  },
  {
    question: "Dá para cadastrar mais de um profissional?",
    answer:
      "Sim. Cada profissional tem sua própria agenda e horário de trabalho. O número de profissionais incluído depende do plano escolhido.",
  },
  {
    question: "Posso trocar de plano depois?",
    answer:
      "Sim, a qualquer momento. Para reduzir o plano, é preciso ter no máximo o número de profissionais que o novo plano permite.",
  },
  {
    question: "Vocês notificam o cliente por WhatsApp?",
    answer:
      "Ainda não. Hoje o foco é deixar a agenda e o link de agendamento redondos. Notificação por WhatsApp e e-mail está no roteiro.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="relative isolate overflow-hidden py-20 lg:py-28">
      <BrandPattern mask="radial-gradient(ellipse 45% 55% at 100% 100%, black 0%, transparent 70%)" />
      <Container>
        <div className="grid gap-10 lg:grid-cols-[0.7fr_1.3fr] lg:gap-16">
          <Reveal>
            <h2 className="font-display text-3xl font-bold tracking-tight text-zinc-900 md:text-4xl dark:text-white">
              Perguntas frequentes
            </h2>
          </Reveal>

          <Reveal delay={0.05}>
            <div>
              {faqs.map((faq) => (
                <AccordionItem key={faq.question} question={faq.question} answer={faq.answer} />
              ))}
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
