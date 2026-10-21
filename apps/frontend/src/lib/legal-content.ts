// TEXTO COMPLETO PROPOSTO, PENDENTE DE REVISÃO DE ADVOGADO. Não é parecer jurídico. As lacunas foram preenchidas
// com os dados da empresa (Receita Federal) e com valores PADRÃO propostos (prazos, reembolso, suporte, retenção,
// foro). Cada um deles é uma decisão de negócio que o advogado deve confirmar ou ajustar. Ver lib/legal.ts: o site
// mostra a faixa de rascunho enquanto LEGAL_DRAFT for true.
//
// As afirmações sobre como o produto funciona (trial, cobrança, dados guardados, e-mails) refletem o código atual
// do Marquo; confira com o time antes de publicar se algo mudou.
//
// Ao mudar o texto de verdade, atualize LEGAL_DOCS_VERSION (packages/shared-types).

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
      "Estes Termos valem entre o Marquo e o dono do negócio que contrata o serviço (o “Estabelecimento”). Quem usa o Marquo apenas para agendar como cliente final, com uma conta de cliente, também aceita estes Termos no que lhe couber e a Política de Privacidade.",
    ],
  },
  {
    title: "2. O serviço",
    paragraphs: [
      "Cada negócio cadastrado (“Estabelecimento”) recebe uma página pública própria para receber agendamentos e um painel de gestão (agenda, clientes, comandas, produtos, caixa, financeiro e comissões, conforme o plano contratado).",
      "O Marquo é uma ferramenta: quem presta o serviço ao cliente final é o Estabelecimento, que é o único responsável por horários, preços, atendimento e pelas relações com os próprios clientes.",
      "O Marquo envia e-mails automáticos ligados ao uso do serviço, como o aviso de novo agendamento para a equipe, a confirmação, a remarcação e o cancelamento para o cliente, e o link para definir a senha. O Estabelecimento autoriza o envio desses e-mails à sua equipe e aos seus clientes. Não enviamos publicidade por esses e-mails.",
    ],
  },
  {
    title: "3. Conta e responsabilidades de acesso",
    paragraphs: [
      "Você deve ser maior de 18 anos e plenamente capaz, ou representar uma pessoa jurídica com poderes para contratar, e informar dados verdadeiros. É responsável por manter a senha em sigilo e por tudo o que for feito com a sua conta e com as contas de profissionais e recepcionistas que você criar.",
      "Avise-nos imediatamente se suspeitar de uso indevido da sua conta.",
    ],
  },
  {
    title: "4. Período de teste, planos e pagamento",
    paragraphs: [
      "Novos cadastros têm 14 dias de teste gratuito, sem necessidade de cartão de crédito. Terminado o teste sem uma assinatura ativa, o acesso ao painel é bloqueado e a página pública deixa de aceitar novos agendamentos até a contratação de um plano.",
      "Os planos, limites (como o número de profissionais) e valores mensais são os exibidos na página de planos no momento da contratação. O pagamento é processado por um provedor de pagamentos parceiro, atualmente o Mercado Pago, e pode ser feito por cartão de crédito, com cobrança recorrente mensal, ou por Pix, com um pagamento a cada mês. No Pix, se o pagamento do mês seguinte não for feito, o acesso termina ao fim do período já pago. O Marquo não recebe nem armazena os dados do seu cartão.",
      "A assinatura no cartão é renovada mensalmente até ser cancelada. Se uma cobrança falhar, o acesso é mantido por até 3 dias após o fim do período e, depois disso, bloqueado até a regularização. Você pode cancelar a qualquer momento; o acesso segue até o fim do período já pago.",
      "Reembolso: o valor já pago por um período não é devolvido proporcionalmente em caso de cancelamento no meio do período, e o acesso continua até o fim dele. Na primeira contratação paga, você pode pedir o cancelamento com devolução integral em até 7 dias corridos do pagamento, nos termos do art. 49 do Código de Defesa do Consumidor, quando aplicável.",
      "Troca de plano: o novo limite de profissionais vale na hora, e o novo valor é cobrado a partir da próxima cobrança, sem cobrança ou crédito proporcional no mês corrente. Para passar a um plano menor, a sua equipe ativa precisa caber no limite do novo plano.",
      "Reajustes de preço: avisaremos com pelo menos 30 dias de antecedência, por e-mail ou pelo painel. O novo valor vale a partir da primeira cobrança depois desse prazo. Quem não concordar pode cancelar antes dessa data, sem multa.",
      "Cupons de desconto valem pelas regras de cada cupom (por exemplo, dias extras de teste ou desconto na primeira cobrança), dentro da validade e do limite de usos, e não são convertidos em dinheiro.",
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
      "Você é responsável por ter base legal para coletar esses dados, por informar seus clientes e por atender aos pedidos deles. Fichas de anamnese podem conter dados de saúde, que são dados pessoais sensíveis: colete apenas o necessário e obtenha o consentimento do titular quando a lei exigir. Para clientes menores de idade, o consentimento deve ser dado por um dos pais ou pelo responsável legal.",
      "Como operador, o Marquo trata esses dados apenas para prestar o serviço e segundo as instruções do Estabelecimento, mantém medidas de segurança adequadas, nos avisa e avisa o Estabelecimento em caso de incidente que os afete, e os exclui ou devolve ao fim do contrato, conforme a seção 10.",
    ],
  },
  {
    title: "7. Disponibilidade e suporte",
    paragraphs: [
      "Trabalhamos para manter o serviço disponível, mas ele pode sofrer interrupções para manutenção ou por falhas fora do nosso controle, como falhas de internet, de provedores de hospedagem, de pagamento ou de e-mail. Não garantimos disponibilidade ininterrupta nem um nível mínimo de disponibilidade. Sempre que possível, avisaremos manutenções programadas com antecedência.",
      "O suporte é prestado por e-mail, em suporte@marquo.com.br, em dias úteis, das 9h às 18h (horário de Brasília), com resposta em até 2 dias úteis.",
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
      "O Marquo é fornecido no estado em que se encontra. Na máxima extensão permitida pela lei, não respondemos por lucros cessantes, perda de clientes ou de agendamentos, danos indiretos, nem por falhas de internet, de provedores de pagamento, de hospedagem ou de e-mail, ou de outros serviços de terceiros.",
      "Quando houver responsabilidade nossa, ela fica limitada ao valor que você pagou ao Marquo nos 12 meses anteriores ao fato que originou o dano.",
      "Nada nestes Termos limita ou exclui responsabilidade que a lei não permita limitar, inclusive os direitos do consumidor previstos no Código de Defesa do Consumidor, quando aplicável. Recomendamos que você mantenha cópia dos dados que considerar essenciais ao seu negócio.",
    ],
  },
  {
    title: "10. Cancelamento e exclusão de dados",
    paragraphs: [
      "Você pode cancelar a assinatura a qualquer momento. Depois do encerramento, mantemos seus dados por 90 dias, para permitir a reativação da conta e a recuperação das informações, e depois os excluímos ou anonimizamos, salvo o que a lei exigir que guardemos, como registros fiscais e de pagamento, que guardamos pelo prazo legal.",
      "Antes disso, você pode pedir uma cópia dos seus dados pelo e-mail suporte@marquo.com.br.",
      "Podemos suspender ou encerrar a conta que descumprir estes Termos ou que esteja sem pagamento, nos termos das seções 4 e 5.",
    ],
  },
  {
    title: "11. Alterações destes termos",
    paragraphs: [
      "Podemos alterar estes termos. A versão em vigor é a indicada no topo desta página. Quando o texto mudar, pediremos que você aceite a nova versão. Alterações relevantes serão comunicadas com pelo menos 30 dias de antecedência, por e-mail ou pelo painel, salvo quando a mudança for exigida por lei ou favorecer você, caso em que pode valer imediatamente.",
      "Se você não concordar com a nova versão, pode cancelar a assinatura antes de ela entrar em vigor.",
    ],
  },
  {
    title: "12. Lei aplicável e foro",
    paragraphs: [
      "Estes termos são regidos pelas leis do Brasil. Fica eleito o foro da comarca de Cabo Frio, Estado do Rio de Janeiro, salvo disposição legal em contrário, inclusive o foro do domicílio do consumidor quando a lei assim determinar.",
    ],
  },
  {
    title: "13. Contato",
    paragraphs: [
      "Dúvidas sobre estes Termos, suporte e assuntos de privacidade e dados pessoais: suporte@marquo.com.br.",
    ],
  },
];

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    title: "1. Quem é o responsável",
    paragraphs: [
      "Esta política descreve como o Marquo trata dados pessoais. Somos VALLE CONSULTORIA E NEGOCIOS LTDA, CNPJ 64.576.289/0001-74, com sede na Rua Julia Kubitschek, nº 16, Loja 04, Centro, Cabo Frio/RJ, CEP 28905-000.",
      "Encarregado pelo tratamento de dados (LGPD): Equipe de Privacidade do Marquo, pelo e-mail suporte@marquo.com.br (use o assunto “Privacidade”).",
      "Papéis: para os dados do dono da conta e dos usuários do Estabelecimento (equipe) e para a conta de cliente do Marquo, somos o controlador. Para os dados dos clientes de cada Estabelecimento, somos o operador e o Estabelecimento é o controlador.",
    ],
  },
  {
    title: "2. Quais dados tratamos",
    paragraphs: [
      "Dono e equipe do Estabelecimento: nome, e-mail, telefone de contato do dono, papel de acesso, senha (guardada apenas na forma de hash, nunca em texto), data e versão do aceite dos termos, e os dados do negócio que você preencher (nome, endereço, horários, telefone/WhatsApp, redes sociais, logo e fotos).",
      "Conta de cliente do Marquo: nome, telefone, e-mail, senha (em hash), avaliações, histórico de agendamentos e os dispositivos/navegadores com sessão aberta.",
      "Clientes dos Estabelecimentos: nome, telefone, e-mail, histórico de atendimentos e pagamentos registrados, observações, etiquetas e fichas de anamnese, que podem conter dados de saúde (dados pessoais sensíveis).",
      "Cobrança: plano, status da assinatura, valores, datas e identificadores da assinatura e dos pagamentos. O Marquo não recebe nem armazena número, validade ou código do cartão.",
      "E-mails do serviço: o endereço de e-mail do destinatário e o conteúdo do aviso (por exemplo, nome do cliente, serviço, profissional, data e horário).",
      "Localização: se você permitir, usamos sua localização aproximada, arredondada para cerca de 1 km, para mostrar estabelecimentos próximos. Ela é usada na hora e não é gravada.",
      "Dados técnicos: cookies de sessão e de preferência (tema), registros de acesso do servidor (endereço IP, data e hora e página acessada) e contadores temporários de tentativas de login, usados para segurança.",
    ],
  },
  {
    title: "3. Para que usamos e em que base legal",
    paragraphs: [
      "Prestar o serviço contratado (criar a conta, agendar, gerir o negócio, cobrar a assinatura e enviar os e-mails do serviço, como avisos e confirmações de agendamento): execução de contrato.",
      "Segurança, prevenção a fraude e abuso, e limites de tentativas de acesso: legítimo interesse.",
      "Guardar registros de acesso e registros fiscais e de pagamento: cumprimento de obrigação legal.",
      "Usar sua localização aproximada para mostrar estabelecimentos próximos: consentimento, que você dá ao permitir a localização no navegador e pode retirar a qualquer momento.",
      "Não enviamos publicidade nem comunicações de marketing. Se isso mudar, pediremos consentimento específico antes.",
      "Os dados dos clientes de cada Estabelecimento são tratados segundo as instruções do Estabelecimento, que é o controlador e responde pela base legal dessa coleta.",
    ],
  },
  {
    title: "4. Com quem compartilhamos",
    paragraphs: [
      "Compartilhamos dados com fornecedores que nos ajudam a operar o serviço: provedor de hospedagem e de servidores, onde o sistema e o banco de dados rodam; Mercado Pago, para processar os pagamentos; e Resend, para enviar os e-mails do serviço. Cada um recebe só o necessário para a sua função.",
      "Os dados de clientes de um Estabelecimento só são visíveis para esse Estabelecimento. A página pública do Estabelecimento (nome, serviços, equipe, avaliações, contato) é visível a qualquer pessoa, e o Estabelecimento pode optar por aparecer na busca de descoberta.",
      "Podemos compartilhar dados com autoridades quando a lei ou uma ordem judicial exigir. Não vendemos dados pessoais.",
      "Transferência internacional: alguns fornecedores, como o provedor de e-mails e o de pagamentos, podem tratar dados fora do Brasil. Quando isso ocorrer, buscamos fornecedores que ofereçam garantias adequadas de proteção, nos termos do art. 33 da LGPD.",
    ],
  },
  {
    title: "5. Por quanto tempo guardamos",
    paragraphs: [
      "Guardamos os dados enquanto a conta estiver ativa e, depois do cancelamento, por 90 dias, para permitir a reativação e a recuperação das informações. Depois disso, excluímos ou anonimizamos.",
      "Guardamos por mais tempo apenas o que a lei exigir: os registros fiscais e de pagamento, pelo prazo legal, e os registros de acesso do servidor, por 6 meses, conforme o Marco Civil da Internet (Lei 12.965/2014).",
    ],
  },
  {
    title: "6. Seus direitos",
    paragraphs: [
      "Nos termos do art. 18 da LGPD, você pode pedir confirmação de tratamento, acesso, correção, anonimização, portabilidade, eliminação de dados tratados com consentimento, informações sobre compartilhamento e a revogação do consentimento.",
      "Peça pelo e-mail suporte@marquo.com.br, com o assunto “Privacidade”. Respondemos em até 15 dias. Se você é cliente de um Estabelecimento, pedidos sobre os dados dele devem ser feitos ao próprio Estabelecimento, que é o controlador. Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).",
    ],
  },
  {
    title: "7. Como protegemos os dados",
    paragraphs: [
      "Senhas são guardadas com hash; a comunicação com o site é criptografada (HTTPS); o acesso aos dados de cada Estabelecimento é isolado dos demais e controlado por papel (dono, recepção, profissional); e limitamos tentativas de acesso para dificultar ataques de força bruta. Trocar a senha encerra as sessões abertas.",
      "Nenhum sistema é totalmente imune a incidentes. Em caso de incidente de segurança que possa causar risco ou dano relevante, comunicaremos os titulares afetados e a ANPD, em prazo razoável e nos termos da regulamentação.",
    ],
  },
  {
    title: "8. Cookies",
    paragraphs: [
      "Usamos apenas cookies necessários ao funcionamento: sessão do dono/equipe, sessão da conta de cliente e preferência de tema (claro/escuro). Não usamos cookies de publicidade nem ferramentas de análise de uso. Se adotarmos alguma, atualizaremos esta política antes.",
    ],
  },
  {
    title: "9. Crianças e adolescentes",
    paragraphs: [
      "O Marquo é destinado a maiores de 18 anos. Estabelecimentos podem atender clientes menores de idade e registrar os dados deles; nesse caso, o Estabelecimento é o responsável por obter o consentimento específico de um dos pais ou do responsável legal, como exige o art. 14 da LGPD.",
    ],
  },
  {
    title: "10. Alterações desta política",
    paragraphs: [
      "Podemos atualizar esta política. A versão em vigor é a indicada no topo da página, e pediremos novo aceite quando o texto mudar de forma relevante, com aviso de pelo menos 30 dias, por e-mail ou pelo painel.",
    ],
  },
  {
    title: "11. Contato",
    paragraphs: [
      "Dúvidas ou pedidos sobre dados pessoais, e suporte geral: suporte@marquo.com.br.",
    ],
  },
];
