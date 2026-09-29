import { expect, test } from '@playwright/test';
import { loginAs } from './helpers.js';

/**
 * Gestão de usuários pelo SUPERADMIN: cria uma categoria com módulos
 * liberados, cria um usuário nessa categoria e confirma que, ao entrar, ele só
 * vê (e só abre) os módulos da categoria. Depois edita as permissões e exclui.
 */
test.describe('Usuários, categorias e permissões', () => {
  test('SUPERADMIN cria categoria e usuário; o usuário só acessa os módulos liberados', async ({
    page,
  }) => {
    const sufixo = Date.now().toString().slice(-7);
    const nomeCategoria = `Portaria ${sufixo}`;
    const email = `cat${sufixo}@rigabras.test`;

    await loginAs(page, 'SUPERADMIN');
    await page.goto('/usuarios');
    await expect(page.getByTestId('usuarios-page')).toBeVisible();

    // Categoria com Portaria + Viagens
    await page.getByTestId('aba-categorias').click();
    await page.getByTestId('categoria-nova').click();
    await page.getByTestId('cat-nome').fill(nomeCategoria);
    await page.getByTestId('cat-mod-portaria').check();
    await page.getByTestId('cat-mod-viagens').check();
    await page.getByTestId('cat-salvar').click();
    await expect(page.getByTestId('usuarios-aviso')).toHaveText('Categoria criada');
    await expect(
      page.getByTestId('categoria-card').filter({ hasText: nomeCategoria }),
    ).toBeVisible();

    // Usuário na categoria
    await page.getByTestId('aba-usuarios').click();
    await page.getByTestId('usuario-nome').fill('Porteiro Playwright');
    await page.getByTestId('usuario-email').fill(email);
    await page.getByTestId('usuario-senha').fill('SenhaForte123');
    await page.getByTestId('usuario-role').selectOption('OPERADOR');
    await page.getByTestId('usuario-categoria').selectOption({ label: nomeCategoria });
    await page.getByTestId('usuario-criar').click();
    await expect(page.getByTestId('usuarios-aviso')).toHaveText('Usuário criado');
    const linha = page.getByTestId('usuario-linha').filter({ hasText: email });
    await expect(linha).toContainText('Da categoria: 2 de');

    // Entra como o novo usuário
    await page.getByTestId('logout-button').click();
    await page.goto('/login');
    await page.getByTestId('login-email').fill(email);
    await page.getByTestId('login-password').fill('SenhaForte123');
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL(/\/viagens$/);
    const nav = page.getByRole('navigation', { name: 'Navegação principal' }).first();
    await expect(nav.getByText('Portaria')).toBeVisible();
    await expect(nav.getByText('WMS')).toHaveCount(0);
    await page.goto('/wms');
    await expect(page.getByTestId('sem-permissao')).toBeVisible();

    // SUPERADMIN personaliza as permissões e depois exclui o usuário
    await page.getByTestId('logout-button').click();
    await loginAs(page, 'SUPERADMIN');
    await page.goto('/usuarios');
    await page
      .getByTestId('usuario-linha')
      .filter({ hasText: email })
      .getByTestId('usuario-editar')
      .click();
    await page.getByTestId('ue-personalizar').check();
    await page.getByTestId('ue-mod-wms').check();
    await page.getByTestId('ue-salvar').click();
    await expect(page.getByTestId('usuarios-aviso')).toContainText('Usuário atualizado');
    await expect(page.getByTestId('usuario-linha').filter({ hasText: email })).toContainText(
      'Personalizado: 3 de',
    );

    page.once('dialog', (d) => void d.accept());
    await page
      .getByTestId('usuario-linha')
      .filter({ hasText: email })
      .getByTestId('usuario-excluir')
      .click();
    await expect(page.getByTestId('usuarios-aviso')).toHaveText('Usuário excluído');
    await expect(page.getByTestId('usuario-linha').filter({ hasText: email })).toHaveCount(0);
  });
});
