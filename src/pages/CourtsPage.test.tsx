import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Session } from '../api/types';
import { listCourts } from '../api/courts';
import { setupTestApi } from '../test/api';
import { CourtsPage } from './CourtsPage';

// 12:00 em São Paulo; as fixtures do mock são relativas a este instante.
const NOW = Date.parse('2026-11-09T12:00:00-03:00');

function renderPage(session: Session, status: 'allowed' | 'denied' | 'checking' = 'allowed') {
  const onExpired = vi.fn();
  const onRetry = vi.fn();
  const view = render(<CourtsPage session={session} access={{ status }} now={() => NOW} onRetry={onRetry} onExpired={onExpired} />);
  return { ...view, onExpired, onRetry };
}

type User = ReturnType<typeof userEvent.setup>;

/** Preenche os campos obrigatórios da quadra (o máximo de jogadores já vem com 4). */
async function fillCourt(user: User, name: string) {
  await user.type(screen.getByLabelText('Nome'), name);
  await user.type(screen.getByLabelText('Endereço'), 'Setor B, perto do estacionamento');
  await user.type(screen.getByLabelText('Área (m²)'), '260,76');
  await user.type(screen.getByLabelText('Preço da hora (R$)'), '120,50');
}

async function fillAndSave(user: User, name: string) {
  await user.click(await screen.findByRole('button', { name: 'Nova quadra' }));
  await fillCourt(user, name);
  await user.selectOptions(screen.getByLabelText('Piso'), 'Saibro');
  await user.click(screen.getByLabelText('Coberta'));
  await user.click(screen.getByRole('button', { name: 'Salvar quadra' }));
}

const card = (name: string) => screen.getByRole('heading', { name }).closest('article') as HTMLElement;

describe('CourtsPage', () => {
  it('admin cadastra quadra e ela aparece na lista', async () => {
    const { admin } = await setupTestApi();
    const user = userEvent.setup();
    renderPage(admin);
    await fillAndSave(user, 'Quadra Central');
    const heading = await screen.findByRole('heading', { name: 'Quadra Central' });
    const card = heading.closest('article') as HTMLElement;
    expect(within(card).getByText('Saibro')).toBeInTheDocument();
    expect(within(card).getByText('Coberta')).toBeInTheDocument();
    expect(within(card).getByText('Setor B, perto do estacionamento')).toBeInTheDocument();
    expect(within(card).getByText(/R\$\s?120,50/)).toBeInTheDocument();
    expect(within(card).getByText('até 4')).toBeInTheDocument();
    expect(within(card).getByText('260,76 m²')).toBeInTheDocument();
    expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument();
  });

  it('campos inválidos mostram erro em cada um e focam o primeiro', async () => {
    const { admin } = await setupTestApi();
    const user = userEvent.setup();
    renderPage(admin);
    await user.click(await screen.findByRole('button', { name: 'Nova quadra' }));
    await user.type(screen.getByLabelText('Nome'), 'Quadra X');
    await user.type(screen.getByLabelText('Área (m²)'), 'grande');
    await user.clear(screen.getByLabelText('Máximo de jogadores'));
    await user.type(screen.getByLabelText('Máximo de jogadores'), '60');
    await user.type(screen.getByLabelText('Preço da hora (R$)'), '10,999');
    await user.click(screen.getByRole('button', { name: 'Salvar quadra' }));
    expect(screen.getByLabelText('Endereço')).toHaveFocus();
    expect(screen.getByLabelText('Endereço')).toHaveAccessibleDescription(/Informe o endereço/);
    expect(screen.getByLabelText('Área (m²)')).toHaveAccessibleDescription(/maior que zero/);
    expect(screen.getByLabelText('Máximo de jogadores')).toHaveAccessibleDescription('Informe de 1 a 50 jogadores.');
    expect(screen.getByLabelText('Preço da hora (R$)')).toHaveAccessibleDescription(/até 2 casas decimais/);
    expect(screen.getByLabelText('Nome')).not.toHaveAttribute('aria-invalid');
  });

  it('lista as quadras existentes com piso e selo Disponível', async () => {
    const { admin } = await setupTestApi();
    renderPage(admin);
    expect(await screen.findByRole('heading', { name: 'Quadra 3' })).toBeInTheDocument();
    expect(screen.getAllByText('Disponível')).toHaveLength(3);
    expect(screen.getByText('Coberta')).toBeInTheDocument();
    expect(within(card('Quadra 3')).getByText('Ginásio coberto')).toBeInTheDocument();
    expect(within(card('Quadra 3')).getByText(/R\$\s?150,00/)).toBeInTheDocument();
  });

  it('nome vazio mostra erro no campo e foca nele', async () => {
    const { admin } = await setupTestApi();
    const user = userEvent.setup();
    renderPage(admin);
    await user.click(await screen.findByRole('button', { name: 'Nova quadra' }));
    await user.click(screen.getByRole('button', { name: 'Salvar quadra' }));
    expect(screen.getByText('Informe o nome da quadra, com até 120 caracteres.')).toBeInTheDocument();
    const name = screen.getByLabelText('Nome');
    expect(name).toHaveFocus();
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAttribute('maxlength', '120');
  });

  it('admin edita o nome e o preço da quadra', async () => {
    const { admin } = await setupTestApi();
    const user = userEvent.setup();
    renderPage(admin);
    await screen.findByRole('heading', { name: 'Quadra 1' });
    await user.click(screen.getAllByRole('button', { name: /^Editar/ })[0]);
    const name = screen.getByLabelText('Nome');
    expect(name).toHaveValue('Quadra 1');
    expect(screen.getByLabelText('Endereço')).toHaveValue('Setor A, ao lado da sede');
    expect(screen.getByLabelText('Área (m²)')).toHaveValue('260,76');
    expect(screen.getByLabelText('Preço da hora (R$)')).toHaveValue('90');
    await user.clear(name);
    await user.type(name, 'Quadra 1 Coberta');
    await user.clear(screen.getByLabelText('Preço da hora (R$)'));
    await user.type(screen.getByLabelText('Preço da hora (R$)'), '95,5');
    await user.click(screen.getByRole('button', { name: 'Salvar quadra' }));
    expect(await screen.findByRole('heading', { name: 'Quadra 1 Coberta' })).toBeInTheDocument();
    expect(within(card('Quadra 1 Coberta')).getByText(/R\$\s?95,50/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Quadra 1' })).not.toBeInTheDocument();
  });

  it('nome duplicado mostra o erro do servidor no campo', async () => {
    const { admin } = await setupTestApi();
    const user = userEvent.setup();
    renderPage(admin);
    await fillAndSave(user, 'quadra 2');
    const name = await screen.findByLabelText('Nome');
    await waitFor(() => expect(name).toHaveAttribute('aria-invalid', 'true'));
    expect(name).toHaveAccessibleDescription('Já existe uma quadra com este nome.');
    expect(name).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Salvar quadra' })).toBeEnabled();
  });

  it('jogador comum vê o painel "Acesso restrito" e nenhum botão de cadastro', async () => {
    const { player } = await setupTestApi();
    renderPage(player, 'denied');
    expect(screen.getByText('Acesso restrito')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nova quadra' })).not.toBeInTheDocument();
  });

  it('403 do servidor aparece como alerta mesmo com o botão visível', async () => {
    const { player } = await setupTestApi();
    const user = userEvent.setup();
    renderPage(player, 'allowed');
    await fillAndSave(user, 'Quadra Nova');
    expect(await screen.findByRole('alert')).toHaveTextContent('Acesso restrito a administradores.');
  });

  it('sessão expirada chama onExpired', async () => {
    const { admin } = await setupTestApi({ scenario: 'expired' });
    const { onExpired } = renderPage(admin);
    await waitFor(() => expect(onExpired).toHaveBeenCalled());
  });

  it('erro ao carregar mostra alerta e permite tentar de novo', async () => {
    const { admin, ctx } = await setupTestApi({ scenario: 'error' });
    const user = userEvent.setup();
    renderPage(admin);
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha simulada no servidor.');
    ctx.scenario = 'success';
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByRole('heading', { name: 'Quadra 1' })).toBeInTheDocument();
  });

  it('nome com HTML aparece como texto', async () => {
    const { admin, api } = await setupTestApi();
    await api.createCourt(admin.token, {
      name: '<img src=x onerror=alert(1)>', address: '<b>Setor</b>', size_m2: 100, max_players: 2, hourly_price: 0, surface: 'grass', covered: false,
    });
    const { container } = renderPage(admin);
    expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('botão Salvar não envia duas vezes em clique duplo', async () => {
    const { admin } = await setupTestApi();
    const user = userEvent.setup();
    renderPage(admin);
    await user.click(await screen.findByRole('button', { name: 'Nova quadra' }));
    await fillCourt(user, 'Quadra Dupla');
    await user.dblClick(screen.getByRole('button', { name: 'Salvar quadra' }));
    await screen.findByRole('heading', { name: 'Quadra Dupla' });
    expect(await listCourts(admin.token)).toHaveLength(4);
  });

  describe('manutenção', () => {
    async function openMaintenance(user: ReturnType<typeof userEvent.setup>, courtName: string) {
      await user.click(await screen.findByRole('button', { name: `Marcar manutenção em ${courtName}` }));
    }
    function fillWindow(start: string, end: string, reason: string) {
      fireEvent.change(screen.getByLabelText('Início'), { target: { value: start } });
      fireEvent.change(screen.getByLabelText('Fim'), { target: { value: end } });
      fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: reason } });
    }

    it('fim antes do início → erro no campo Fim', async () => {
      const { admin } = await setupTestApi({ now: () => NOW });
      const user = userEvent.setup();
      renderPage(admin);
      await openMaintenance(user, 'Quadra 2');
      fillWindow('2026-11-10T18:00', '2026-11-10T17:00', 'Piso novo');
      await user.click(screen.getByRole('button', { name: 'Salvar manutenção' }));
      const end = screen.getByLabelText('Fim');
      expect(end).toHaveAccessibleDescription('O fim precisa ser depois do início.');
      expect(end).toHaveAttribute('aria-invalid', 'true');
      expect(end).toHaveFocus();
    });

    it('período com reservas mostra o aviso e pede confirmação', async () => {
      const { admin, ctx } = await setupTestApi({ now: () => NOW });
      const user = userEvent.setup();
      renderPage(admin);
      await openMaintenance(user, 'Quadra 1');
      fillWindow('2026-11-10T18:00', '2026-11-10T21:00', 'Pintura');
      await user.click(screen.getByRole('button', { name: 'Salvar manutenção' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Há 1 reserva(s) nesse período.');
      expect(ctx.db.bookings.find((item) => item.id === 5)?.status).toBe('active');
      await user.click(screen.getByLabelText('Cancelar as reservas afetadas'));
      await user.click(screen.getByRole('button', { name: 'Salvar manutenção' }));
      expect(await screen.findByText('Pintura')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('Manutenção registrada.');
      expect(ctx.db.bookings.find((item) => item.id === 5)?.status).toBe('cancelled');
    });

    it('mudar o período depois do aviso invalida a confirmação de cancelamento', async () => {
      const { admin, ctx } = await setupTestApi({ now: () => NOW });
      const user = userEvent.setup();
      renderPage(admin);
      await openMaintenance(user, 'Quadra 1');
      fillWindow('2026-11-10T18:00', '2026-11-10T21:00', 'Pintura');
      await user.click(screen.getByRole('button', { name: 'Salvar manutenção' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Há 1 reserva(s) nesse período.');
      await user.click(screen.getByLabelText('Cancelar as reservas afetadas'));
      fireEvent.change(screen.getByLabelText('Fim'), { target: { value: '2026-11-10T20:00' } });
      expect(screen.queryByLabelText('Cancelar as reservas afetadas')).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Salvar manutenção' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Há 1 reserva(s) nesse período.');
      expect(screen.getByLabelText('Cancelar as reservas afetadas')).not.toBeChecked();
      expect(ctx.db.bookings.find((item) => item.id === 5)?.status).toBe('active');
    });

    it('janela cobrindo agora mostra "Em manutenção até"', async () => {
      const { admin } = await setupTestApi({ now: () => NOW });
      const user = userEvent.setup();
      renderPage(admin);
      await openMaintenance(user, 'Quadra 2');
      fillWindow('2026-11-09T11:00', '2026-11-09T14:00', 'Reforma');
      await user.click(screen.getByRole('button', { name: 'Salvar manutenção' }));
      const card = (await screen.findByRole('heading', { name: 'Quadra 2' })).closest('article') as HTMLElement;
      expect(await within(card).findByText(/^Em manutenção até .*14:00/)).toBeInTheDocument();
      expect(within(card).getByText('Reforma')).toBeInTheDocument();
    });

    it('remover janela volta o status para Disponível', async () => {
      const { admin, api } = await setupTestApi({ now: () => NOW });
      await api.addMaintenance(admin.token, 2, {
        starts_at: '2026-11-09T11:00:00-03:00', ends_at: '2026-11-09T14:00:00-03:00', reason: 'Reforma',
      });
      const user = userEvent.setup();
      renderPage(admin);
      const card = (await screen.findByRole('heading', { name: 'Quadra 2' })).closest('article') as HTMLElement;
      expect(within(card).getByText('Em manutenção')).toBeInTheDocument();
      await user.click(within(card).getByRole('button', { name: /^Remover manutenção de Quadra 2/ }));
      await waitFor(() => expect(within(card).getByText('Disponível')).toBeInTheDocument());
      expect(within(card).queryByText('Reforma')).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('Manutenção removida.');
    });

    it('janela futura da fixture aparece com botão Remover de nome distinto', async () => {
      const { admin } = await setupTestApi({ now: () => NOW });
      renderPage(admin);
      expect(await screen.findByText('Troca da rede')).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: /^Remover manutenção de Quadra 3/ })).toHaveLength(1);
    });

    it('403 ao registrar mostra alerta; formulário continua aberto', async () => {
      const { player } = await setupTestApi({ now: () => NOW });
      const user = userEvent.setup();
      renderPage(player, 'allowed');
      await openMaintenance(user, 'Quadra 2');
      fillWindow('2026-11-10T08:00', '2026-11-10T09:00', 'Teste');
      await user.click(screen.getByRole('button', { name: 'Salvar manutenção' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Acesso restrito a administradores.');
      expect(screen.getByLabelText('Motivo')).toBeInTheDocument();
    });
  });

  describe('exclusão', () => {
    it('pede confirmação, exclui e devolve o foco a "Nova quadra"', async () => {
      const { admin } = await setupTestApi({ now: () => NOW });
      const user = userEvent.setup();
      renderPage(admin);
      await user.click(await screen.findByRole('button', { name: 'Excluir Quadra 3' }));
      const dialog = screen.getByRole('alertdialog', { name: 'Excluir Quadra 3?' });
      expect(within(dialog).getByRole('button', { name: 'Manter quadra' })).toHaveFocus();
      await user.click(within(dialog).getByRole('button', { name: 'Excluir quadra' }));
      await waitFor(() => expect(screen.queryByRole('heading', { name: 'Quadra 3' })).not.toBeInTheDocument());
      expect(screen.getByRole('status')).toHaveTextContent('Quadra Quadra 3 excluída.');
      expect(screen.getByRole('button', { name: 'Nova quadra' })).toHaveFocus();
      expect((await listCourts(admin.token)).map((court) => court.name)).toEqual(['Quadra 1', 'Quadra 2']);
    });

    it('"Manter quadra" fecha a confirmação e volta o foco ao botão', async () => {
      const { admin } = await setupTestApi({ now: () => NOW });
      const user = userEvent.setup();
      renderPage(admin);
      await user.click(await screen.findByRole('button', { name: 'Excluir Quadra 2' }));
      await user.click(screen.getByRole('button', { name: 'Manter quadra' }));
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Excluir Quadra 2' })).toHaveFocus();
    });

    it('quadra com reserva futura mostra o motivo e continua na lista', async () => {
      const { admin } = await setupTestApi({ now: () => NOW });
      const user = userEvent.setup();
      renderPage(admin);
      await user.click(await screen.findByRole('button', { name: 'Excluir Quadra 1' }));
      await user.click(screen.getByRole('button', { name: 'Excluir quadra' }));
      const dialog = screen.getByRole('alertdialog');
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('A quadra tem reservas ou pedidos na fila');
      expect(screen.getByRole('heading', { name: 'Quadra 1' })).toBeInTheDocument();
    });
  });

  describe('acessibilidade dos cartões', () => {
    it('botões têm nomes distintos por quadra', async () => {
      const { admin } = await setupTestApi({ now: () => NOW });
      renderPage(admin);
      await screen.findByRole('heading', { name: 'Quadra 1' });
      expect(screen.getByRole('button', { name: 'Editar Quadra 2' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Marcar manutenção em Quadra 3' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Excluir Quadra 1' })).toBeInTheDocument();
    });

    it('foco vai ao primeiro campo ao abrir e volta ao botão ao cancelar ou salvar', async () => {
      const { admin } = await setupTestApi({ now: () => NOW });
      const user = userEvent.setup();
      renderPage(admin);
      await user.click(await screen.findByRole('button', { name: 'Editar Quadra 2' }));
      expect(screen.getByLabelText('Nome')).toHaveFocus();
      await user.click(screen.getByRole('button', { name: 'Cancelar' }));
      expect(screen.getByRole('button', { name: 'Editar Quadra 2' })).toHaveFocus();

      await user.click(screen.getByRole('button', { name: 'Marcar manutenção em Quadra 2' }));
      expect(screen.getByLabelText('Início')).toHaveFocus();
      await user.click(screen.getByRole('button', { name: 'Cancelar' }));
      expect(screen.getByRole('button', { name: 'Marcar manutenção em Quadra 2' })).toHaveFocus();

      await user.click(screen.getByRole('button', { name: 'Nova quadra' }));
      expect(screen.getByLabelText('Nome')).toHaveFocus();
      await fillCourt(user, 'Quadra Foco');
      await user.click(screen.getByRole('button', { name: 'Salvar quadra' }));
      expect(await screen.findByRole('status')).toHaveTextContent('Quadra salva.');
      expect(screen.getByRole('button', { name: 'Nova quadra' })).toHaveFocus();
    });
  });
});
