import { CheckCircle } from "@phosphor-icons/react/dist/ssr";
import { Container } from "../ui/Container";
import { Button } from "../ui/Button";
import { Reveal } from "../ui/Reveal";
import { BrandPattern } from "../brand/BrandPattern";

// Abertura de /para-donos: a página inteira é para quem TEM um salão/barbearia e quer entender
// como a plataforma funciona antes de criar a conta. Não faz a busca de cliente (isso é a home).
export function OwnerHero() {
  return (
    <section id="top" className="relative isolate overflow-hidden pt-32 pb-20 lg:pt-40 lg:pb-24">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-accent-100/70 via-transparent to-transparent dark:from-accent-500/10"
      />
      <BrandPattern mask="radial-gradient(ellipse 70% 60% at 50% 0%, black 0%, transparent 75%)" />

      <Container>
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex rounded-full bg-accent-50 px-3 py-1 text-xs font-semibold tracking-wide text-accent-700 uppercase dark:bg-accent-500/10 dark:text-accent-300">
              Para donos de salão e barbearia
            </span>
            <h1 className="mt-5 font-display text-4xl font-bold tracking-tight text-balance text-zinc-900 md:text-5xl dark:text-white">
              Sua agenda organizada e seu negócio{" "}
              <span className="text-accent-500">encontrado por novos clientes</span>.
            </h1>
            <p className="mx-auto mt-5 max-w-[50ch] text-lg leading-relaxed text-zinc-600 dark:text-stone-300">
              O Marquo reúne agenda online, gestão da equipe e uma página própria para o seu
              negócio, que aparece na busca de quem está procurando um salão perto.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button href="/cadastro">Criar conta grátis</Button>
              <Button href="/entrar" variant="ghost">
                Já tenho conta
              </Button>
            </div>

            <ul className="mx-auto mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-zinc-600 dark:text-stone-300">
              {["14 dias grátis", "Sem cartão para começar"].map((item) => (
                <li key={item} className="inline-flex items-center gap-1.5">
                  <CheckCircle size={16} weight="fill" className="text-accent-500" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
