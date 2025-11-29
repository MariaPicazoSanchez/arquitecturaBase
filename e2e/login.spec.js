import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('http://localhost:3000/');
  await expect( page.getByText('Ignition') ).toBeVisible();
  await page.locator('#menuIniciarSesion').click();
  await page.getByRole('textbox', { name: 'Email' }).click();
  await page.getByRole('textbox', { name: 'Email' }).fill('maria.picazo5@alu.uclm.es');
  await page.getByRole('textbox', { name: 'Email' }).press('Tab');
  await page.getByRole('textbox', { name: 'Password' }).fill('Hola1234');
  await page.locator('#btnLogin').click();

  await expect(
    page.getByText('Bienvenido al sistema, maria.picazo5@alu.uclm.es')
  ).toBeVisible();
  await page.getByRole('button', { name: 'Crear partida' }).click();
  await page.getByRole('button', { name: 'Salir' }).click();
  await expect(page.getByRole('heading', { name: 'Registro de usuario' })).toBeVisible();

});