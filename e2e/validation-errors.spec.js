import { test, expect } from '@playwright/test';

test.describe('Validaciones en el formulario de registro', () => {
  test('Validar campos obligatorios', async ({ page }) => {
    await page.goto('http://localhost:3000/');

    // Intentar registrar sin llenar ningún campo
    await page.getByRole('button', { name: 'Registrar' }).click();
    await expect(page.getByText('Debes introducir un email válido')).toBeVisible();
    await page.getByText('Cerrar').click();

    // Llenar solo el campo de Nick
    await page.getByRole('textbox', { name: 'Nick (único):' }).fill('nickvalido');
    await page.getByRole('button', { name: 'Registrar' }).click();
    await expect(page.getByText('Debes introducir un email válido')).toBeVisible();
    await page.getByText('Cerrar').click();
  });

  test('Validar formato de email', async ({ page }) => {
    await page.goto('http://localhost:3000/');

    // Llenar el campo de Email con un correo inválido
    await page.getByRole('textbox', { name: 'Email address:' }).fill('correo invalido');
    await page.getByRole('button', { name: 'Registrar' }).click();
    await expect(page.getByText('El email no tiene un formato válido')).toBeVisible();
    await page.getByText('Cerrar').click();

    // Llenar el campo de Email con un correo parcialmente válido
    await page.getByRole('textbox', { name: 'Email address:' }).fill('correoinvalido@');
    await page.getByRole('button', { name: 'Registrar' }).click();
    await expect(page.getByText('El email no tiene un formato válido')).toBeVisible();
    await page.getByText('Cerrar').click();

    // Llenar el campo de Email con un correo válido
    await page.getByRole('textbox', { name: 'Email address:' }).fill('correoinvalido@algo.com');
    await page.getByRole('button', { name: 'Registrar' }).click();
    await expect(page.getByRole('heading', { name: 'Inicio de sesión' })).toBeVisible();
  });

  test('Validar contraseña requerida', async ({ page }) => {
    await page.goto('http://localhost:3000/');

    // Llenar los campos de Nick y Email
    await page.getByRole('textbox', { name: 'Nick (único):' }).fill('nickvalido');
    await page.getByRole('textbox', { name: 'Email address:' }).fill('correo@valido.com');
    await page.getByRole('button', { name: 'Registrar' }).click();
    await expect(page.getByText('Debes introducir una contraseña')).toBeVisible();
    await page.getByText('Cerrar').click();

    // Llenar el campo de Contraseña
    await page.getByRole('textbox', { name: 'Password:' }).fill('unaContraseña15-');
    await page.getByRole('button', { name: 'Registrar' }).click();
    await expect(page.getByRole('heading', { name: 'Inicio de sesión' })).toBeVisible();
  });

  test('Validar contraseña requerida con reglas estrictas', async ({ page }) => {
    await page.goto('http://localhost:3000/');

    // Llenar los campos de Nick y Email con valores únicos
    await page.getByRole('textbox', { name: 'Nick (único):' }).fill(`nick_${Date.now()}`);
    await page.getByRole('textbox', { name: 'Email address:' }).fill(`correo_${Date.now()}@correo.com`);

    // Intentar registrar sin llenar el campo de contraseña
    await page.getByRole('button', { name: 'Registrar' }).click();
    await expect(page.getByText('Debes introducir una contraseña')).toBeVisible();
    await page.getByText('Cerrar').click();

    // Intentar registrar con una contraseña que no cumple las reglas
    await page.getByRole('textbox', { name: 'Password:' }).fill('contra');
    await page.getByRole('button', { name: 'Registrar' }).click();
    await expect(page.getByText('La contraseña debe tener:')).toBeVisible();
    await page.getByText('Cerrar').click();

    await page.getByRole('textbox', { name: 'Password:' }).fill('contraseñA');
    await page.getByRole('button', { name: 'Registrar' }).click();
    await expect(page.getByText('La contraseña debe tener:')).toBeVisible();
    await page.getByText('Cerrar').click();

    await page.getByRole('textbox', { name: 'Password:' }).fill('contraseñA1');
    await page.getByRole('button', { name: 'Registrar' }).click();
    await expect(page.getByText('La contraseña debe tener:')).toBeVisible();
    await page.getByText('Cerrar').click();

    // Registrar con una contraseña válida
    await page.getByRole('textbox', { name: 'Password:' }).fill('contraseñA1+');
    await page.getByRole('button', { name: 'Registrar' }).click();
    await expect(page.getByRole('heading', { name: 'Inicio de sesión' })).toBeVisible();
  });
});