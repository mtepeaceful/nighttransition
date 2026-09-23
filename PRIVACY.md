# Política de Privacidade do NightTransition

Vigente desde 23 de setembro de 2026.

O NightTransition é uma extensão para o Google Chrome que aquece a cor das páginas à noite e lembra você de fazer uma pausa em sites que você mesmo escolheu. Esta política explica quais dados a extensão usa e o que acontece com eles.

## Resumo

- A extensão **não envia nenhum dado** para o desenvolvedor nem para terceiros.
- Não há conta, cadastro, anúncios, rastreamento nem ferramentas de análise.
- A extensão não faz nenhuma requisição de rede.
- Tudo o que a extensão guarda fica no seu navegador.

## O que fica salvo e onde

**Suas configurações**, guardadas em `chrome.storage.sync`:

- horário de início e de fim do modo noturno;
- temperatura do filtro e opções de transição;
- tempo para o lembrete e duração da contagem regressiva;
- a lista de sites em que você quer ser lembrado de pausar.

Se a sincronização do Chrome estiver ativada, o próprio Chrome sincroniza esses dados entre os seus dispositivos pela sua conta Google, conforme a [Política de Privacidade do Google](https://policies.google.com/privacy). O desenvolvedor não tem acesso a eles.

**O estado da noite**, guardado em `chrome.storage.local` (só neste dispositivo):

- se o modo noturno está ativo e se você o ligou ou desligou manualmente;
- o tempo que você passou, durante a noite, em cada site **da sua lista**, identificado apenas pelo domínio (por exemplo, `exemplo.com`).

Esse tempo só é contado enquanto a aba está visível, e só nos sites que você adicionou à lista. Ele é zerado sempre que o modo noturno começa ou termina.

## Acesso às páginas que você visita

Para aplicar o filtro de cor, a extensão roda em todas as páginas. Nelas, ela só faz duas coisas: desenha uma camada de cor sobre a página e, nos sites da sua lista, mostra o lembrete de pausa. Ela não lê o conteúdo, os formulários nem as senhas das páginas.

O endereço da página serve apenas para verificar se o site está na sua lista. Endereços de sites fora da lista não são guardados. Quando você abre o popup, a extensão consulta o site da aba atual para mostrar quanto falta para a próxima pausa nele.

## Notificações

A extensão mostra uma notificação do sistema quando o modo noturno começa. Nenhum dado sai do navegador por causa disso.

## Como apagar seus dados

- Remova um site da lista, no popup, para ele deixar de ser acompanhado.
- Desinstale a extensão para apagar todos os dados que ela guardou neste navegador.

## Mudanças nesta política

Se esta política mudar, a nova versão será publicada neste mesmo endereço, com a data de vigência atualizada.

## Contato

Dúvidas ou pedidos: abra uma issue em <https://github.com/mtepeaceful/nighttransition/issues>.
