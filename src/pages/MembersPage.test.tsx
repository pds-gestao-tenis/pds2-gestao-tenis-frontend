import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Session } from '../api/types';
import { setupTestApi } from '../test/api';
import { MembersPage } from './MembersPage';

function renderPage(session: Session, status: 'allowed' | 'denied' | 'checking' = 'allowed') {
  const onExpired = vi.fn();
  const onRetry = vi.fn();
  const view = render(<MembersPage session={session} access={{ status }} onRetry={onRetry} onExpired={onExpired} />);
  return { ...view, onExpired, onRetry };
}

const row = (name: string) => screen.getByRole('rowheader', { name }).closest('tr') as HTMLElement;

describe('MembersPage', () => {
  it('lista os membros com e-mail, telefone e situação', async () => {
    const { admin } = await setupTestApi();
    renderPage(admin);
    await screen.findByRole('rowheader', { name: 'Mariana Silva' });
    expect(screen.getByText('3 membros')).toBeInTheDocument();
    const mariana = row('Mariana Silva');
    expect(within(mariana).getByText('mariana@clube.example')).toBeInTheDocument();
    expect(within(mariana).getByText('+55 (31) 99999-1234')).toBeInTheDocument();
    expect(within(mariana).getByText('Ativo')).toBeInTheDocument();
    expect(within(row('Pedro Santos')).getByText('Inativo')).toBeInTheDocument();
  });

  it('cadastra um membro e ele aparece na lista', async () => {
    const { admin } = await setupTestApi();
    const user = userEvent.setup();
    renderPage(admin);
    await user.click(await screen.findByRole('button', { name: 'Novo membro' }));
    await user.type(screen.getByLabelText('Nome'), 'Lucas Prado');
    await user.type(screen.getByLabelText('E-mail'), ' Lucas@Clube.Example ');
    await user.type(screen.getByLabelText('Telefone (opcional)'), '(31) 98765-4321');
    await user.click(screen.getByRole('button', { name: 'Salvar membro' }));

    expect(await screen.findByText('Membro Lucas Prado cadastrado.')).toBeInTheDocument();
    const lucas = await screen.findByRole('rowheader', { name: 'Lucas Prado' });
    expect(within(lucas.closest('tr')!).getByText('lucas@clube.example')).toBeInTheDocument();
    expect(screen.getByText('4 membros')).toBeInTheDocument();
    expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument();
  });

  it('valida os campos e foca o primeiro com erro', async () => {
    const { admin } = await setupTestApi();
    const user = userEvent.setup();
    renderPage(admin);
    await user.click(await screen.findByRole('button', { name: 'Novo membro' }));
    await user.type(screen.getByLabelText('E-mail'), 'sem-arroba');
    await user.type(screen.getByLabelText('Telefone (opcional)'), '12');
    await user.click(screen.getByRole('button', { name: 'Salvar membro' }));

    expect(screen.getByText('Informe o nome.')).toBeInTheDocument();
    expect(screen.getByText('Informe um e-mail válido.')).toBeInTheDocument();
    expect(screen.getByText('Informe um telefone com 7 a 15 dígitos e formato válido.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nome')).toHaveFocus();
    expect(screen.getByLabelText('Nome')).toHaveAttribute('aria-invalid', 'true');
  });

  it('mostra no campo o e-mail já cadastrado devolvido pela API', async () => {
    const { admin } = await setupTestApi();
    const user = userEvent.setup();
    renderPage(admin);
    await user.click(await screen.findByRole('button', { name: 'Novo membro' }));
    await user.type(screen.getByLabelText('Nome'), 'Outra Mariana');
    await user.type(screen.getByLabelText('E-mail'), 'mariana@clube.example');
    await user.click(screen.getByRole('button', { name: 'Salvar membro' }));

    expect(await screen.findByText(/já está cadastrado/)).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail')).toHaveFocus();
  });

  it('edita a situação de um membro', async () => {
    const { admin } = await setupTestApi();
    const user = userEvent.setup();
    renderPage(admin);
    await user.click(await screen.findByRole('button', { name: 'Editar Pedro Santos' }));
    expect(screen.getByLabelText('Nome')).toHaveValue('Pedro Santos');
    await user.selectOptions(screen.getByLabelText('Situação', { selector: 'form select' }), 'Ativo');
    await user.click(screen.getByRole('button', { name: 'Salvar membro' }));

    expect(await screen.findByText('Membro atualizado.')).toBeInTheDocument();
    expect(within(row('Pedro Santos')).getByText('Ativo')).toBeInTheDocument();
  });

  it('exclui só depois de confirmar', async () => {
    const { admin } = await setupTestApi();
    const user = userEvent.setup();
    renderPage(admin);
    await user.click(await screen.findByRole('button', { name: 'Excluir Camila Oliveira' }));
    await user.click(screen.getByRole('button', { name: 'Manter membro' }));
    expect(row('Camila Oliveira')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Excluir Camila Oliveira' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Excluir Camila Oliveira?' });
    await user.click(within(dialog).getByRole('button', { name: 'Excluir membro' }));

    expect(await screen.findByText('Membro Camila Oliveira excluído.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('rowheader', { name: 'Camila Oliveira' })).not.toBeInTheDocument());
    expect(screen.getByText('2 membros')).toBeInTheDocument();
  });

  it('busca por nome ou e-mail e avisa quando nada é encontrado', async () => {
    const { admin } = await setupTestApi();
    const user = userEvent.setup();
    renderPage(admin);
    await screen.findByRole('rowheader', { name: 'Mariana Silva' });
    await user.type(screen.getByRole('searchbox', { name: 'Buscar por nome ou e-mail' }), 'camila');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    await waitFor(() => expect(screen.queryByRole('rowheader', { name: 'Mariana Silva' })).not.toBeInTheDocument());
    expect(screen.getByRole('rowheader', { name: 'Camila Oliveira' })).toBeInTheDocument();

    await user.clear(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), 'ninguém');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(await screen.findByRole('heading', { name: 'Nenhum membro encontrado' })).toBeInTheDocument();
  });

  it('filtra por situação', async () => {
    const { admin } = await setupTestApi();
    const user = userEvent.setup();
    renderPage(admin);
    await screen.findByRole('rowheader', { name: 'Mariana Silva' });
    await user.selectOptions(screen.getByLabelText('Situação'), 'Inativos');
    await waitFor(() => expect(screen.getByText('1 membro')).toBeInTheDocument());
    expect(screen.getByRole('rowheader', { name: 'Pedro Santos' })).toBeInTheDocument();
    expect(screen.queryByRole('rowheader', { name: 'Mariana Silva' })).not.toBeInTheDocument();
  });

  it('pagina a lista de 10 em 10', async () => {
    const { admin, api } = await setupTestApi();
    for (let i = 1; i <= 9; i++) {
      await api.createMember(admin.token, { name: `Sócio ${String(i).padStart(2, '0')}`, email: `socio${i}@clube.example` });
    }
    const user = userEvent.setup();
    renderPage(admin);
    expect(await screen.findByText('Página 1 de 2')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(11); // cabeçalho + 10
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Próxima' }));
    expect(await screen.findByText('Página 2 de 2')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(3));
    expect(screen.getByRole('button', { name: 'Próxima' })).toBeDisabled();
  });

  it('sem membros, indica como cadastrar o primeiro', async () => {
    const { admin, api } = await setupTestApi();
    for (const id of [1, 2, 3]) await api.deleteMember(admin.token, id);
    renderPage(admin);
    expect(await screen.findByRole('heading', { name: 'Nenhum membro cadastrado' })).toBeInTheDocument();
  });

  it('conta sem acesso administrativo não vê a gestão', async () => {
    const { player } = await setupTestApi();
    renderPage(player, 'denied');
    expect(screen.getByRole('heading', { name: 'Área administrativa' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Novo membro' })).not.toBeInTheDocument();
  });

  it('sessão expirada ao carregar chama onExpired', async () => {
    const { admin } = await setupTestApi({ scenario: 'expired' });
    const { onExpired } = renderPage(admin);
    await waitFor(() => expect(onExpired).toHaveBeenCalled());
  });
});
