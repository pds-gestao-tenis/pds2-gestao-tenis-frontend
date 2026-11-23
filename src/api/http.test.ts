import { describe, expect, it, vi } from 'vitest';
import { ApiError, errorMessage, isExpired } from './error';
import { pathId, request } from './http';

// fetch é a fronteira externa, então o stub é legítimo aqui.
describe('request', () => {
  it('converte 422 em ApiError com fieldErrors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ message: 'Dados inválidos.', errors: { name: ['Obrigatório'] } }), {
            status: 422,
          }),
      ),
    );
    await expect(request('/x')).rejects.toMatchObject({
      status: 422,
      message: 'Dados inválidos.',
      fieldErrors: { name: ['Obrigatório'] },
    });
  });

  it('converte falha de rede em ApiError status 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(request('/x')).rejects.toMatchObject({ name: 'ApiError', status: 0 });
  });

  it('devolve o corpo JSON em sucesso', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
    await expect(request('/x')).resolves.toEqual({ ok: true });
  });
});

describe('pathId', () => {
  it('aceita inteiro positivo', () => expect(pathId(12)).toBe('12'));
  it.each([0, -1, 1.5, NaN, 2 ** 53])('pathId(%s) lança 422', (id) => {
    expect(() => pathId(id)).toThrow(expect.objectContaining({ status: 422 }));
  });
});

describe('error helpers', () => {
  it('isExpired só para ApiError 401', () => {
    expect(isExpired(new ApiError('x', 401))).toBe(true);
    expect(isExpired(new ApiError('x', 403))).toBe(false);
    expect(isExpired(new Error('x'))).toBe(false);
  });
  it('errorMessage usa a mensagem do ApiError', () => {
    expect(errorMessage(new ApiError('Horário ocupado.', 409), 'Falhou.')).toBe('Horário ocupado.');
  });
  it('errorMessage não expõe erros desconhecidos', () => {
    expect(errorMessage(new TypeError('x is undefined'), 'Falhou.')).toBe('Falhou.');
  });
});
