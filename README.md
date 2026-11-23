# Clube de Tênis — Frontend

Interface em React, TypeScript, Vite e CSS puro, com cadastro, login, gestão de membros, reservas, fila de espera, notificações, taxas, parceiros e administração da agenda. Funciona sem backend com dados simulados. O cliente HTTP usa os contratos descritos abaixo.

## Telas do clube

| Rota | Tela | Quem acessa |
|---|---|---|
| `#/cadastro` | Criar conta de acesso e seguir para o login | Visitantes |
| `#/membros` | Buscar, cadastrar, editar, inativar e remover membros | Administração |
| `#/quadras` | Quadras: criar, editar e marcar manutenção (a manutenção pode cancelar reservas do período) | Administração |
| `#/agenda` | Agenda dos próximos 7 dias por quadra e horário; reservar com participantes, entrar na fila de espera de horários ocupados | Todas as contas |
| `#/agenda/remarcar/{id}` | Remarcar uma reserva para outro horário livre | Quem organiza a reserva |
| `#/reservas` | Minhas reservas (próximas e passadas), confirmação de presença e ofertas da fila de espera | Todas as contas |
| `#/reservas/{id}` | Detalhe da reserva: participantes, confirmar ou recusar presença, remarcar e cancelar | Quem organiza ou participa |
| `#/notificacoes` | Confirmações, alterações, cancelamentos, convites e lembretes; marcar como lidas | Todas as contas, somente seus avisos |
| `#/taxas` | Taxas próprias pendentes/pagas, histórico e pagamento simulado no mock | Membro vinculado à conta |
| `#/financeiro` | Lançar taxas, registrar pagamentos parciais/totais e visualizar membros com pendências | Administração |
| `#/parceiros` | Nível, disponibilidade semanal, jogadores compatíveis e convites para reservas | Todas as contas |
| `#/admin/reservas` | Agenda centralizada, filtros, histórico, alteração e cancelamento de reservas | Administração |
| `#/admin/ocupacao` | Indicadores de ocupação, horas disponíveis/bloqueadas e cancelamentos por quadra | Administração |

Quando uma vaga abre, a primeira pessoa da fila recebe uma oferta com prazo para aceitar ou recusar.

Na agenda de hoje, horários livres que já começaram aparecem como "encerrado" e não abrem o formulário de reserva nem de remarcação. Esse estado existe só na tela: a API continua mandando `free`, e o servidor recusa reservar no passado.

## Executar sem backend

Use Node.js 24.15 ou posterior da série 24 para rodar o projeto e os testes. A versão verificada foi a 24.16.0.

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Abra [localhost:5173](http://localhost:5173).

O `.env.example` ativa os dados simulados. As contas fictícias são `admin@clube.example`, `usuario@clube.example`, `mariana@clube.example`, `pedro@clube.example` e `camila@clube.example`, todas com a senha `SenhaSegura123`. Só a primeira é administrativa. Mariana Silva, Pedro Santos e Camila Oliveira aparecem na busca de participantes e servem para testar convites, confirmação de presença e fila de espera; no início, Mariana já está convidada para uma reserva organizada por `usuario@clube.example`.

Os dados simulados ficam na sessão da aba e não são enviados à API. Use somente dados fictícios. As opções disponíveis estão em `.env.example`; reinicie o Vite após alterar `.env.local`.

Para testar o cadastro, abra **Criar conta** na tela de entrada e faça login com os dados recém-cadastrados. Em **Membros**, a administração pode cadastrar ou editar a ficha de um membro. A ficha fica disponível para lançamentos no Financeiro. Criar uma conta ou uma ficha mantém os registros separados. O vínculo para consultar taxas pessoais depende da identificação da conta pelo backend. As contas de demonstração vinculadas já vêm prontas no mock.

Para demonstrar as US16–US30:

1. Como administrador, abra **Financeiro**, lance uma taxa para Mariana e registre, se quiser, um pagamento parcial. O painel **Membros com pendências** agrupa o saldo em aberto por membro e destaca valores vencidos.
2. Saia e entre como Mariana. **Minhas taxas** mostra seu saldo e permite **Simular pagamento**, com confirmação explícita de que nada será cobrado. As contas de Mariana, Pedro e Camila estão vinculadas aos membros 1, 2 e 3; Bruno e a administradora não possuem taxas pessoais por padrão.
3. Em duas contas de jogadores, abra **Encontrar parceiros → Editar perfil** e salve nível e disponibilidade em comum. Perfis começam vazios. A busca considera diferença de até 1 nível e pelo menos uma hora semanal em comum. Remover a disponibilidade retira o perfil da busca.
4. Reserve um horário como organizador e convide um parceiro para essa reserva. O convidado recebe um aviso e confirma ou recusa presença no detalhe da reserva. O limite é de três convidados; convites repetidos são recusados.
5. Como administrador, consulte **Reservas do clube**, escolha o período e altere/cancele uma reserva. Os envolvidos recebem notificações; o horário liberado segue as regras da fila. O histórico preserva reservas concluídas e canceladas. Em **Quadras → Marcar manutenção**, informe também bloqueios para eventos usando o período e o motivo.
6. Em **Ocupação**, selecione um período de até 366 dias. O cálculo divide horas reservadas por horas disponíveis, entre 07:00 e 22:00. Faixas de uma hora tocadas por bloqueios são descontadas uma única vez; reservas canceladas não contam como ocupação. Períodos futuros representam reservas agendadas, sem medir presença real.

Os avisos são internos ao aplicativo, atualizados a cada 30 segundos com a página visível e após ações na conta. O lembrete é gerado uma vez por jogador e horário na janela de 30 minutos anterior à reserva, sem avisar convidados que recusaram presença. No mock, a geração depende de consultar o aplicativo nessa janela; não há envio com o navegador fechado, e-mail ou push. O backend deverá gerar eventos e executar o agendamento dos lembretes.

O pagamento no mock é uma simulação local do saldo restante, sem coleta de cartão, Pix ou transferência. A US22 ainda depende de backend e provedor para movimentar dinheiro de verdade. Em produção, a tela só atualiza a taxa com a resposta do servidor; não confirma pagamentos por conta própria. Dados antigos do mock são migrados de forma aditiva, preservando reservas e sessões.

O cenário é escolhido em `VITE_MOCK_SCENARIO`. Para reservas, use `conflict`: toda tentativa de reservar ou remarcar responde 409 ("Esse horário acabou de ser reservado por outra pessoa"), útil para ver o alerta de conflito e a recarga da agenda. Ele não ocupa o horário de verdade; para testar a fila de espera, entre com outra conta em um horário já reservado (por exemplo, a reserva de `usuario@clube.example` vista por `pedro@clube.example`).

## Executar com backend

Em `.env.local`, configure:

```env
VITE_USE_MOCK_API=false
API_PROXY_TARGET=http://localhost:8000
```

Inicie a API e execute `npm run dev`. O Vite encaminha as requisições `/api/*` ao backend. As sessões de mock e API real são separadas.

O frontend consulta `/api/v1/auth/me` para recuperar a sessão. Como a resposta de usuário ainda não informa se a conta é administrativa, o acesso à área de membros é verificado por `/api/v1/members?page_size=1`. A autorização continua sendo responsabilidade do backend.

## Testes

```powershell
npm test
```

Executa a suíte do Vitest (jsdom e Testing Library) uma vez. Use `npm run test:watch` durante o desenvolvimento.

## Contrato da API de reservas (para o backend)

O backend ainda precisa implementar os endpoints abaixo, em `/api/v1`. As respostas com conteúdo vêm no envelope `{ "data": ... }`; sair da fila e recusar a oferta respondem `204` sem corpo. Erros vêm como `{ "message", "errors" }`. Os status usados são 401, 403, 404, 409, 422 e 429. Os tipos da coluna "Resposta" estão em `src/api/types.ts`. O mock em `src/mocks/` é a referência executável das regras e `src/api/real.ts` é o cliente que chama estes endpoints.

| Endpoint | Corpo enviado | Resposta |
|---|---|---|
| `GET /courts` | | `{ data: Court[] }` |
| `POST /courts` | `name`, `surface`, `covered` | `{ data: Court }` |
| `PATCH /courts/{id}` | `name`, `surface`, `covered` (parcial) | `{ data: Court }` |
| `POST /courts/{id}/maintenance` | `starts_at`, `ends_at`, `reason`, `cancel_bookings` (opcional) | `{ data: Court }` |
| `DELETE /courts/{id}/maintenance/{mid}` | | `{ data: Court }` |
| `GET /schedule?date=` | | `{ data: Schedule }` |
| `GET /players?q=` | | `{ data: Player[] }` (só `id` e `name`) |
| `POST /bookings` | `court_id`, `starts_at`, `participant_ids` | `{ data: Booking }` |
| `GET /bookings?scope=upcoming\|past` | | `{ data: Booking[] }` |
| `GET /bookings/{id}` | | `{ data: Booking }` |
| `POST /bookings/{id}/cancel` | | `{ data: Booking }` |
| `PATCH /bookings/{id}` (remarcar) | `court_id`, `starts_at` | `{ data: Booking }` |
| `PUT /bookings/{id}/attendance` | `response`: `confirmed` ou `declined` | `{ data: Booking }` |
| `GET /waitlist` | | `{ data: WaitlistEntry[] }` |
| `POST /waitlist` | `court_id`, `starts_at` | `{ data: WaitlistEntry }` |
| `DELETE /waitlist/{id}` | | `204`, sem corpo |
| `POST /waitlist/{id}/accept` | | `{ data: Booking }` |
| `POST /waitlist/{id}/decline` | | `204`, sem corpo |

Toda autorização (administração, organizador, participante) precisa ser verificada no servidor; o frontend apenas esconde botões. Reservas de outras pessoas devem responder 404, só o organizador cancela ou remarca (403 para participantes) e conflitos de horário respondem 409.

`starts_at` de reservas, remarcações e fila é sempre uma hora cheia exata (sem segundos), entre 07:00 e 21:00 no horário do clube; fora disso, 422. Horário que já começou responde 422 ("Esse horário já passou.").

Aceitar uma oferta vencida responde 409. Se o servidor já tiver tirado a entrada da fila, a resposta pode ser 404; a tela trata os dois casos como "oferta encerrada" e recarrega a lista.

## Contratos adicionais: US16–US30

Estes endpoints também são propostas para a integração futura, em `/api/v1`, com envelope `{ data: ... }`. Tipos e regras executáveis estão em `src/api/types.ts` e nos handlers do mock.

| Endpoint | Corpo / consulta | Resposta |
|---|---|---|
| `GET /notifications` | Somente avisos da conta autenticada | `{ data: ClubNotification[] }` |
| `PUT /notifications/{id}/read` | | `{ data: ClubNotification }` |
| `PUT /notifications/read-all` | | `204`, sem corpo |
| `GET /fees` | `scope=mine\|all`, `status=pending\|paid`, `member_id` opcional | `{ data: Fee[] }` |
| `POST /fees` | `member_id`, `description`, `amount_cents`, `due_date` | `{ data: Fee }` |
| `POST /fees/{id}/payments` | `amount_cents`, `paid_on` | `{ data: Fee }` |
| `POST /fees/{id}/checkout` | `idempotency_key`; somente taxa da própria conta | `{ data: Fee }` |
| `GET /players/me/profile` | | `{ data: PlayerProfile }` |
| `PUT /players/me/profile` | `level` (1–5 ou `null`), `availability` | `{ data: PlayerProfile }` |
| `GET /players/compatible` | | `{ data: CompatiblePlayer[] }` |
| `POST /bookings/{id}/invitations` | `player_id`; somente organizador | `{ data: Booking }` |
| `GET /admin/bookings` | `from`, `to` (datas inclusivas), `court_id` e `status` opcionais | `{ data: Booking[] }` |
| `POST /admin/bookings/{id}/cancel` | | `{ data: Booking }` |
| `PATCH /admin/bookings/{id}` | `court_id`, `starts_at` | `{ data: Booking }` |
| `GET /admin/occupancy` | `from`, `to` (até 366 dias) | `{ data: Occupancy[] }` |

Taxas usam **centavos inteiros**, datas `YYYY-MM-DD` e pagamentos parciais ou totais; o saldo é calculado pelo servidor. `pending` inclui taxas parcialmente pagas. Somente administradores lançam taxas, registram pagamentos manuais e consultam `scope=all`. O vínculo entre conta e membro deve ser determinado pelo servidor, nunca por um identificador enviado pelo jogador.

No checkout, o servidor deve determinar o saldo, tratar a chave de idempotência de forma persistente e atômica e confirmar a quitação apenas após confirmação do provedor. Retornar uma taxa ainda `pending` mantém a tela aguardando confirmação, com atualização pela consulta de taxas. O contrato atual não implementa redirecionamento, QR Code nem webhook; esses detalhes precisam ser combinados com o backend/provedor.

`availability` contém até um intervalo por dia: `{ weekday: 0..6, start_time: "18:00", end_time: "21:00" }`, com domingo igual a 0, horas inteiras entre 07:00 e 22:00 e fim maior que início, no fuso do clube. A busca só divulga nome, nível e intervalos em comum. O convite acrescenta presença `pending` à reserva e gera `booking_invitation` para o convidado.

Todas as rotas `/admin/*` exigem administração. Alteração/cancelamento administrativo preserva o organizador, respeita conflitos, bloqueios e a agenda dos próximos sete dias, reinicia a presença dos convidados quando há remarcação e gera avisos. No retorno administrativo, `my_role` pode ser `administrator`. Notificações alheias e taxas pessoais de outro membro respondem 404; acesso administrativo sem permissão responde 403. Nenhuma tela substitui essas verificações no servidor.

## Build

```powershell
npm run build
npm run preview
```

O build de produção sempre usa a API real. Para uma API em outra origem, defina `VITE_API_URL` antes do build, sem `/api/v1` no final, e configure CORS no backend. Na mesma origem, o servidor de hospedagem deve encaminhar `/api` ao backend.

Não inclua `.env.local`, `node_modules` ou `dist` no Git; o `.gitignore` já os exclui. Mantenha `.env.example` e `package-lock.json` no repositório.
