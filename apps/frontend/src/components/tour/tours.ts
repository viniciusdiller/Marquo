import type { TenantSetupStepId } from "@marquo/shared-types";
import type { Placement } from "./geometry";

// Um "ponto" do tour: um elemento da tela (marcado com data-tour="...") destacado com um balão explicando o que fazer.
export interface TourStop {
  id: string;
  // Em quais telas este ponto vale (pathname). Fora delas o tour espera, e oferece "Continuar".
  path: RegExp;
  // Valor do atributo data-tour do elemento destacado.
  target: string;
  title: string;
  body: string;
  // Verbo curto do que fazer ("Clique em Gerenciar"), mostrado como selo.
  action?: string;
  tip?: string;
  placement?: Placement | "auto";
  // Clicar no próprio destaque avança o tour (usado quando o clique leva a outra tela).
  advanceOn?: "click";
  // Para onde voltar (e em qual ponto) se a pessoa sair desta tela no meio do tour. Padrão: não oferece.
  resume?: { href: string; index: number };
  // Quando o elemento não existe na tela (ex.: ainda não há profissional para "Gerenciar").
  missing?: { title: string; body: string; goTo?: { label: string; tourId: TenantSetupStepId } };
}

export interface Tour {
  id: TenantSetupStepId;
  title: string;
  // Página onde o tour começa.
  href: string;
  stops: TourStop[];
}

const SERVICES = /^\/dashboard\/servicos\/?$/;
const PROFESSIONALS = /^\/dashboard\/profissionais\/?$/;
const PROFESSIONAL_DETAIL = /^\/dashboard\/profissionais\/[^/]+\/?$/;
const SETTINGS = /^\/dashboard\/configuracoes\/?$/;

const MANAGE_STOP: TourStop = {
  id: "manage",
  path: PROFESSIONALS,
  target: "professional-manage",
  title: "Abra a ficha do profissional",
  body: "Clique em “Gerenciar” ao lado do nome dele. É nessa ficha que ficam os horários de trabalho e os serviços que ele atende.",
  action: "Clique em “Gerenciar”",
  advanceOn: "click",
  placement: "auto",
  missing: {
    title: "Cadastre um profissional primeiro",
    body: "Os horários e os serviços pertencem a um profissional. Cadastre a equipe no Passo 2 e depois volte para este passo.",
    goTo: { label: "Ir para o Passo 2", tourId: "professionals" },
  },
};

const BACK_TO_LIST = { href: "/dashboard/profissionais", index: 0 };

export const TOURS: Record<TenantSetupStepId, Tour> = {
  services: {
    id: "services",
    title: "Cadastrar serviços",
    href: "/dashboard/servicos",
    stops: [
      {
        id: "form",
        path: SERVICES,
        target: "service-form-intro",
        title: "Cadastre seu primeiro serviço",
        body: "Serviço é o que o cliente escolhe na hora de agendar: corte, barba, sobrancelha… Vamos preencher este formulário juntos, campo por campo.",
        placement: "bottom",
      },
      {
        id: "name",
        path: SERVICES,
        target: "service-name",
        title: "Dê um nome ao serviço",
        body: "Escreva do jeito que o cliente reconhece, por exemplo “Corte masculino”. É esse nome que aparece na sua página de agendamento.",
        action: "Digite o nome do serviço",
      },
      {
        id: "duration",
        path: SERVICES,
        target: "service-duration",
        title: "Quanto tempo ele leva?",
        body: "Informe a duração em minutos (ex.: 40). A agenda usa esse tempo para reservar o horário e só mostra ao cliente os horários em que o serviço cabe inteiro.",
        action: "Digite os minutos",
        tip: "Use múltiplos de 5 minutos.",
      },
      {
        id: "price",
        path: SERVICES,
        target: "service-price",
        title: "Defina o preço",
        body: "Digite o valor em reais (ex.: 45,00). Ele é copiado para o atendimento na hora da marcação, então mudar o preço depois não altera agendamentos já feitos.",
        action: "Digite o valor",
      },
      {
        id: "submit",
        path: SERVICES,
        target: "service-submit",
        title: "Salve o serviço",
        body: "Clique em “Cadastrar serviço”. Repita para cada serviço que você oferece.",
        action: "Clique em “Cadastrar serviço”",
        tip: "Depois volte ao Início: o Passo 1 aparece como concluído e o guia mostra o próximo.",
        placement: "top",
      },
    ],
  },

  professionals: {
    id: "professionals",
    title: "Cadastrar a equipe",
    href: "/dashboard/profissionais",
    stops: [
      {
        id: "form",
        path: PROFESSIONALS,
        target: "professional-form-intro",
        title: "Cadastre quem atende os clientes",
        body: "Cada profissional tem login próprio e uma agenda separada. Se você atende sozinho, cadastre você mesmo aqui.",
        placement: "bottom",
      },
      {
        id: "name",
        path: PROFESSIONALS,
        target: "professional-name",
        title: "Nome do profissional",
        body: "É como ele aparece na agenda e na sua página pública.",
        action: "Digite o nome",
      },
      {
        id: "email",
        path: PROFESSIONALS,
        target: "professional-email",
        title: "E-mail de acesso",
        body: "É o login do profissional no sistema. Não pode repetir um e-mail já cadastrado.",
        action: "Digite o e-mail",
      },
      {
        id: "password",
        path: PROFESSIONALS,
        target: "professional-password",
        title: "Senha inicial",
        body: "Mínimo de 8 caracteres. Combine a senha com o profissional para o primeiro acesso.",
        action: "Crie uma senha",
      },
      {
        id: "services",
        path: PROFESSIONALS,
        target: "professional-services",
        title: "Quais serviços ele faz?",
        body: "Marque os serviços que este profissional realiza. Só dá para agendar com ele o que estiver marcado. Se ainda não marcou, dá para vincular depois em “Gerenciar”.",
        action: "Marque os serviços",
      },
      {
        id: "submit",
        path: PROFESSIONALS,
        target: "professional-submit",
        title: "Salve o cadastro",
        body: "Clique em “Cadastrar profissional”.",
        action: "Clique em “Cadastrar profissional”",
        tip: "Em seguida, clique em “Gerenciar” ao lado do nome dele: lá ficam os horários (Passo 3) e, se você não marcou os serviços aqui, o vínculo deles (Passo 4).",
        placement: "top",
      },
    ],
  },

  working_hours: {
    id: "working_hours",
    title: "Definir horários de expediente",
    href: "/dashboard/profissionais",
    stops: [
      MANAGE_STOP,
      {
        id: "hours",
        path: PROFESSIONAL_DETAIL,
        target: "working-hours",
        title: "Defina os dias e horários",
        body: "Para cada dia da semana, informe de que horas até que horas ele atende. “Não atende” significa folga fixa. Para o intervalo de almoço, cadastre dois horários no mesmo dia (ex.: 09:00–12:00 e 13:30–18:00).",
        action: "Preencha os horários",
        placement: "right",
        resume: BACK_TO_LIST,
      },
      {
        id: "save",
        path: PROFESSIONAL_DETAIL,
        target: "working-hours-save",
        title: "Salve os horários",
        body: "As alterações só valem depois de clicar em “Salvar horários”.",
        action: "Clique em “Salvar horários”",
        tip: "Quando aparecer “Horários salvos.”, o Passo 3 está concluído.",
        placement: "top",
        resume: BACK_TO_LIST,
      },
    ],
  },

  service_links: {
    id: "service_links",
    title: "Vincular serviços ao profissional",
    href: "/dashboard/profissionais",
    stops: [
      MANAGE_STOP,
      {
        id: "links",
        path: PROFESSIONAL_DETAIL,
        target: "service-links",
        title: "Marque os serviços que ele faz",
        body: "Marque cada serviço que este profissional realiza. A marcação vale na hora, não tem botão de salvar.",
        action: "Marque os serviços",
        tip: "Regra de ouro: sem o serviço marcado aqui, o cliente não vê horários livres com este profissional.",
        placement: "right",
        resume: BACK_TO_LIST,
      },
    ],
  },

  location: {
    id: "location",
    title: "Endereço e localização",
    href: "/dashboard/configuracoes",
    stops: [
      {
        id: "address",
        path: SETTINGS,
        target: "address",
        title: "Informe o endereço",
        body: "Digite rua, número e bairro. O endereço aparece na sua página pública para o cliente saber onde chegar.",
        action: "Digite o endereço",
        tip: "Para aparecer em “Perto de você” no marketplace, ajuste também a localização em Marketplace (menu lateral).",
      },
      {
        id: "save",
        path: SETTINGS,
        target: "profile-save",
        title: "Salve as alterações",
        body: "Clique em “Salvar” para publicar o endereço na sua página.",
        action: "Clique em “Salvar”",
        placement: "top",
      },
    ],
  },

  contact: {
    id: "contact",
    title: "WhatsApp de atendimento",
    href: "/dashboard/configuracoes",
    stops: [
      {
        id: "whatsapp",
        path: SETTINGS,
        target: "whatsapp",
        title: "Adicione o WhatsApp de atendimento",
        body: "Digite DDD + número. A sua página pública mostra um botão que abre a conversa com esse número, para o cliente tirar dúvidas.",
        action: "Digite o número",
      },
      {
        id: "save",
        path: SETTINGS,
        target: "profile-save",
        title: "Salve as alterações",
        body: "Clique em “Salvar” para publicar o WhatsApp na sua página.",
        action: "Clique em “Salvar”",
        placement: "top",
      },
    ],
  },
};

export function isTourId(value: unknown): value is TenantSetupStepId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(TOURS, value);
}
