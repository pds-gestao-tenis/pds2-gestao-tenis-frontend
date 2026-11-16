import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DEMO_USER_EMAIL } from '../mocks/fixtures';
import { setupTestApi } from '../test/api';
import { RegisterForm } from './RegisterForm';

async function fill(values: { name?: string; email?: string; password?: string; confirmation?: string }) {
  const user = userEvent.setup();
  if (values.name) await user.type(screen.getByLabelText('Nome'), values.name);
  if (values.email) await user.type(screen.getByLabelText('E-mail'), values.email);
  if (values.password) await user.type(screen.getByLabelText('Senha'), values.password);
  if (values.confirmation) await user.type(screen.getByLabelText('Confirme a senha'), values.confirmation);
  await user.click(screen.getByRole('button', { name: 'Criar conta' }));
}

describe('RegisterForm', () => {
  it('cria a conta e devolve o usuário', async () => {
    await setupTestApi();
    const onRegistered = vi.fn();
    render(<RegisterForm onRegistered={onRegistered} />);
    await fill({ name: 'Maria Silva', email: 'Maria@Example.com', password: 'SenhaSegura123', confirmation: 'SenhaSegura123' });
    await vi.waitFor(() => expect(onRegistered).toHaveBeenCalledOnce());
    expect(onRegistered.mock.calls[0][0]).toMatchObject({ name: 'Maria Silva', email: 'maria@example.com' });
  });

  it('valida os campos antes de enviar', async () => {
    await setupTestApi();
    const onRegistered = vi.fn();
    render(<RegisterForm onRegistered={onRegistered} />);
    await fill({ email: 'maria', password: 'curta', confirmation: 'outra' });
    expect(screen.getByText('Informe seu nome.')).toBeInTheDocument();
    expect(screen.getByText('Informe um e-mail válido, como nome@exemplo.com.')).toBeInTheDocument();
    expect(screen.getByText('A senha ainda não atende a todas as exigências.')).toBeInTheDocument();
    expect(screen.getByText('A confirmação de senha não confere.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nome')).toHaveFocus();
    expect(onRegistered).not.toHaveBeenCalled();
  });

  it('mostra o erro de e-mail já cadastrado', async () => {
    await setupTestApi();
    const onRegistered = vi.fn();
    render(<RegisterForm onRegistered={onRegistered} />);
    await fill({ name: 'Bruno', email: DEMO_USER_EMAIL, password: 'SenhaSegura123', confirmation: 'SenhaSegura123' });
    expect(await screen.findByText('Este e-mail já está cadastrado.')).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail')).toHaveFocus();
    expect(onRegistered).not.toHaveBeenCalled();
  });

  it('marca cada exigência da senha enquanto a pessoa digita', async () => {
    await setupTestApi();
    const user = userEvent.setup();
    render(<RegisterForm onRegistered={() => {}} />);
    const input = screen.getByLabelText('Senha');
    const rule = (name: string) => screen.getByText(name).closest('li');
    expect(input).not.toHaveAttribute('aria-invalid');

    await user.type(input, 'senha1');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(rule('Uma letra minúscula')).toHaveClass('is-met');
    expect(rule('Um número')).toHaveClass('is-met');
    expect(rule('Uma letra maiúscula')).not.toHaveClass('is-met');
    expect(rule('Pelo menos 12 caracteres')).not.toHaveClass('is-met');

    await user.type(input, 'SeguraAbc');
    expect(input).not.toHaveAttribute('aria-invalid');
    for (const item of screen.getByRole('list', { name: 'Exigências da senha' }).querySelectorAll('li')) {
      expect(item).toHaveClass('is-met');
    }
  });

  it('tem link de volta para o login', async () => {
    await setupTestApi();
    render(<RegisterForm onRegistered={() => {}} />);
    expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '#/entrar');
  });
});
