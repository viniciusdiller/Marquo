// RASCUNHO. Não é parecer jurídico e não foi revisado por advogado. Toda lacuna está marcada como
// [PREENCHER: ...] (dado da empresa), [DECIDIR: ...] (decisão de negócio) ou [REVISAR: ...]
// (ponto para o advogado). Ver lib/legal.ts.
//
// As afirmações sobre como o produto funciona (trial, cobrança, dados guardados) refletem o código
// atual do Marquo; confira com o time antes de publicar se algo mudou.

export interface LegalSection {
  title: string;
  paragraphs: string[];
}

export const TERMS_SECTIONS: LegalSection[] = [
  {
    title: "1. Quem somos e aceite",
    paragraphs: [
      "O Marquo é um sistema de agendamento e gestão para salões, barbearias e prestadores de serviço por horário, oferecido por VALLE CONSULTORIA E NEGOCIOS LTDA, inscrita no CNPJ 64.576.289/0001-74, com sede na Rua Julia Kubitschek, nº 16, Loja 04, Centro, Cabo Frio/RJ, CEP 28905-000 (“Marquo”, “nós”).",
      "Ao criar uma conta você declara que leu e aceita estes Termos de Uso e a Política de Privacidade. Se não concordar, não crie a conta.",
    ],
  },
  {
    title: "2. O serviço",
    paragraphs: [
      "Cada negócio cadastrado (“Estabelecimento”) recebe uma página pública própria para receber agendamentos e um painel de gestão (agenda, clientes, comandas, produtos, caixa, financeiro e comissões, conforme o plano contratado).",
      "O Marquo é uma ferramenta: quem presta o serviço ao cliente final é o Estabelecimento, que é o único responsável por horários, preços, atendimento e pelas relações com os próprios clientes.",
    ],
  },
  {
    title: "3. Conta e responsabilidades de acesso",
    paragraphs: [
      "Você deve ter [REVISAR: idade mínima e capacidade civil para contratar] e informar dados verdadeiros. É responsável por manter a senha em sigilo e por tudo o que for feito com a sua conta e com as contas de profissionais e recepcionistas que você criar.",
      "Avise-nos imediatamente se suspeitar de uso indevido da sua conta.",
    ],
  },
  {
    title: "4. Período de teste, planos e pagamento",
    paragraphs: [
      "Novos cadastros têm 14 dias de teste gratuito, sem necessidade de cartão de crédito. Terminado o teste sem uma assinatura ativa, o acesso ao painel é bloqueado e a página pública deixa de aceitar novos agendamentos até a contratação de um plano.",
      "Os planos, limites (como o número de profissionais) e valores mensais são os exibidos na página de planos no momento da contratação. O pagamento é processado por um provedor de pagamentos parceiro [REVISAR: confirmar o provedor e as formas de pagamento aceitas]; o Marquo não recebe nem armazena os dados do seu cartão.",
      "A assinatura é renovada mensalmente até ser cancelada. Você pode cancelar a qualquer momento; o acesso segue até o fim do período já pago. Política de reembolso: [DECIDIR: reembolso proporcional, nenhum reembolso ou prazo de arrependimento].",
      "Reajustes de preço: [DECIDIR: regra e prazo de aviso prévio para reajuste].",
    ],
  },
  {
    title: "5. Uso aceitável",
    paragraphs: [
      "É proibido usar o Marquo para atividades ilegais, para enviar conteúdo ofensivo ou enganoso, para tentar acessar dados de outros Estabelecimentos, para sobrecarregar ou testar a segurança do sistema sem autorização, ou para revender o acesso sem acordo por escrito.",
      "Podemos suspender contas que violem estas regras, com aviso quando possível.",
    ],
  },
  {
    title: "6. Dados dos seus clientes",
    paragraphs: [
      "Os dados pessoais dos clientes do seu Estabelecimento (nome, telefone, e-mail, histórico de atendimentos, notas, fichas de anamnese e avaliações) são tratados por nós em seu nome. Em relação a eles, o Estabelecimento é o controlador e o Marquo é o operador, nos termos da Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018).",
      "Você é responsável por ter base legal para coletar esses dados, por informar seus clientes e por atender aos pedidos deles. Fichas de anamnese podem conter dados de saúde, que são dados pessoais sensíveis: colete apenas o necessário. [REVISAR: cláusula de operador/controlador e eventual contrato de tratamento de dados.]",
    ],
  },
  {
    title: "7. Disponibilidade e suporte",
    paragraphs: [
      "Trabalhamos para manter o serviço disponível, mas ele pode sofrer interrupções para manutenção ou por falhas fora do nosso controle. Não garantimos disponibilidade ininterrupta. Compromisso de disponibilidade e canal de suporte: [DECIDIR: SLA, horário e canal de suporte].",
    ],
  },
  {
    title: "8. Propriedade intelectual",
    paragraphs: [
      "O software, a marca e o layout do Marquo pertencem a nós. Você recebe um direito de uso limitado, não exclusivo e intransferível enquanto sua conta estiver ativa.",
      "Os conteúdos que você enviar (logo, fotos, textos, dados de clientes) continuam sendo seus; você nos autoriza a armazená-los e exibi-los apenas para prestar o serviço.",
    ],
  },
  {
    title: "9. Limitação de responsabilidade",
    paragraphs: [
      "[REVISAR: limitação de responsabilidade, exclusão de lucros cessantes e teto de indenização, respeitando o Código de Defesa do Consumidor quando aplicável.]",
    ],
  },
  {
    title: "10. Cancelamento e exclusão de dados",
    paragraphs: [
      "Você pode cancelar a assinatura a qualquer momento. Depois do encerramento, mantemos seus dados por [DECIDIR: prazo de retenção após cancelamento] e depois os excluímos ou anonimizamos, salvo o que a lei exigir que guardemos. Antes disso, você pode pedir uma cópia dos seus dados por [PREENCHER: canal de contato].",
    ],
  },
  {
    title: "11. Alterações destes termos",
    paragraphs: [
      "Podemos alterar estes termos. A versão em vigor é a indicada no topo desta página. Quando o texto mudar, pediremos que você aceite a nova versão. Alterações relevantes serão comunicadas com [DECIDIR: antecedência mínima de aviso].",
    ],
  },
  {
    title: "12. Lei aplicável e foro",
    paragraphs: [
      "Estes termos são regidos pelas leis do Brasil. Fica eleito o foro de [PREENCHER: comarca/foro], salvo disposição legal em contrário.",
    ],
  },
];

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    title: "1. Quem é o responsável",
    paragraphs: [
      "Esta política descreve como o Marquo trata dados pessoais. Somos VALLE CONSULTORIA E NEGOCIOS LTDA, CNPJ 64.576.289/0001-74, com sede na Rua Julia Kubitschek, nº 16, Loja 04, Centro, Cabo Frio/RJ, CEP 28905-000.",
      "Encarregado pelo tratamento de dados (LGPD): [PREENCHER: nome e e-mail do encarregado].",
      "Papéis: para os dados do dono da conta e dos usuários do Estabelecimento (equipe) e para a conta de cliente do Marquo, somos o controlador. Para os dados dos clientes de cada Estabelecimento, somos o operador e o Estabelecimento é o controlador. [REVISAR: enquadramento dos papéis.]",
    ],
  },
  {
    title: "2. Quais dados tratamos",
    paragraphs: [
      "Dono e equipe do Estabelecimento: nome, e-mail, papel de acesso, senha (guardada apenas na forma de hash, nunca em texto), data e versão do aceite dos termos, e os dados do negócio que você preencher (nome, endereço, horários, telefone/WhatsApp, redes sociais, logo e fotos).",
      "Conta de cliente do Marquo: nome, telefone, e-mail, senha (em hash), avaliações, histórico de agendamentos e os dispositivos/navegadores com sessão aberta.",
      "Clientes dos Estabelecimentos: nome, telefone, e-mail, histórico de atendimentos e pagamentos registrados, observações, etiquetas e fichas de anamnese, que podem conter dados de saúde (dados pessoais sensíveis). [REVISAR: tratamento de dados sensíveis, art. 11 da LGPD.]",
      "Dados técnicos: cookies de sessão e de preferência (tema), e registros de acesso do servidor, que incluem endereço IP. Contadores de tentativas de login são mantidos temporariamente. [PREENCHER: confirmar quais logs a hospedagem/proxy guardam e por quanto tempo.]",
      "Pagamentos: o pagamento é processado por um provedor de pagamentos parceiro [REVISAR: confirmar o provedor]. O Marquo não recebe nem armazena número, validade ou código do cartão; guarda apenas identificadores da assinatura e o status de cobrança.",
    ],
  },
  {
    title: "3. Para que usamos e em que base legal",
    paragraphs: [
      "Prestar o serviço contratado (criar a conta, agendar, gerir o negócio e cobrar a assinatura): execução de contrato.",
      "Segurança, prevenção a fraude e abuso, e limites de tentativas de acesso: legítimo interesse.",
      "Cumprir obrigações legais e regulatórias: obrigação legal.",
      "[REVISAR: confirmar a base legal de cada finalidade e se há finalidades que dependem de consentimento, como comunicações de marketing.]",
    ],
  },
  {
    title: "4. Com quem compartilhamos",
    paragraphs: [
      "Compartilhamos dados com fornecedores que nos ajudam a operar o serviço: hospedagem e infraestrutura ([PREENCHER: provedor de hospedagem/VPS]), processamento de pagamentos ([REVISAR: provedor de pagamentos]) e [PREENCHER: outros fornecedores, como e-mail transacional ou análise de uso, se houver].",
      "Os dados de clientes de um Estabelecimento só são visíveis para esse Estabelecimento. A página pública do Estabelecimento (nome, serviços, equipe, avaliações, contato) é visível a qualquer pessoa, e o Estabelecimento pode optar por aparecer na busca de descoberta.",
      "Transferência internacional: alguns fornecedores, como o provedor de pagamentos, podem tratar dados fora do Brasil. [REVISAR: mecanismo de transferência internacional, art. 33 da LGPD.]",
    ],
  },
  {
    title: "5. Por quanto tempo guardamos",
    paragraphs: [
      "Guardamos os dados enquanto a conta estiver ativa e, depois do cancelamento, por [DECIDIR: prazo de retenção após cancelamento], salvo quando a lei exigir prazo maior. Depois disso, excluímos ou anonimizamos.",
    ],
  },
  {
    title: "6. Seus direitos",
    paragraphs: [
      "Nos termos do art. 18 da LGPD, você pode pedir confirmação de tratamento, acesso, correção, anonimização, portabilidade, eliminação de dados tratados com consentimento, informações sobre compartilhamento e a revogação do consentimento.",
      "Peça pelo e-mail [PREENCHER: e-mail do encarregado]. Se você é cliente de um Estabelecimento, pedidos sobre os dados dele devem ser feitos ao próprio Estabelecimento, que é o controlador. Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).",
    ],
  },
  {
    title: "7. Como protegemos os dados",
    paragraphs: [
      "Senhas são guardadas com hash; o acesso aos dados de cada Estabelecimento é isolado dos demais e controlado por papel (dono, recepção, profissional); e limitamos tentativas de acesso para dificultar ataques de força bruta. Nenhum sistema é totalmente imune a incidentes; em caso de incidente relevante, comunicaremos os afetados e a ANPD nos termos da lei. [REVISAR: descrever medidas e fluxo de comunicação de incidentes; confirmar uso de HTTPS em toda a comunicação.]",
    ],
  },
  {
    title: "8. Cookies",
    paragraphs: [
      "Usamos apenas cookies necessários ao funcionamento: sessão do dono/equipe, sessão da conta de cliente e preferência de tema (claro/escuro). Não usamos cookies de publicidade. [PREENCHER: confirmar a lista de cookies antes de publicar e incluir qualquer ferramenta de análise que venha a ser adotada.]",
    ],
  },
  {
    title: "9. Crianças e adolescentes",
    paragraphs: [
      "O Marquo é destinado a maiores de idade. [REVISAR: tratamento de dados de menores, que podem ser clientes de um Estabelecimento, e o papel do responsável legal.]",
    ],
  },
  {
    title: "10. Alterações desta política",
    paragraphs: [
      "Podemos atualizar esta política. A versão em vigor é a indicada no topo da página, e pediremos novo aceite quando o texto mudar de forma relevante.",
    ],
  },
];
