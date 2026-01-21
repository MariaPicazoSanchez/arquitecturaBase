import { test, expect } from '@playwright/test';

test.describe('Login y recuperación de contraseña', () => {
  test('test', async ({ page }) => {
    await page.goto('http://localhost:3000/');

    // Iniciar sesión
    await page.locator('#fmRegistro').getByRole('button', { name: 'Iniciar sesión' }).click();
    await page.getByRole('textbox', { name: 'Email' }).click();
    await page.getByRole('textbox', { name: 'Email' }).fill('borrar@prueba.com');
    await page.getByRole('textbox', { name: 'Contraseña' }).click();
    await page.getByRole('textbox', { name: 'Contraseña' }).fill('Hola1234*');
    await page.locator('#btnLogin').click();

    // Jugar una partida
    await page.getByRole('button', { name: 'Entrar' }).first().click();
    await page.getByRole('button', { name: 'Crear partida' }).click();
    await page.getByLabel('Modo').selectOption('PVBOT');
    await page.getByRole('button', { name: 'Crear', exact: true }).click();
    await page.getByRole('button', { name: 'Salir al lobby' }).click();

    // Repetir el proceso de jugar y abandonar partidas
    for (let i = 0; i < 2; i++) {
      await page.getByRole('button', { name: 'Entrar' }).nth(i + 1).click();
      await page.getByRole('button', { name: 'Crear partida' }).click();
      await page.getByLabel('Modo').selectOption('PVBOT');
      await page.getByRole('button', { name: 'Crear', exact: true }).click();
      await page.getByRole('button', { name: 'Abandonar' }).click();
    }
    
  });

  test('Recuperar contraseña olvidada', async ({ page }) => {
    await page.goto('http://localhost:3000/');
    await page.locator('#menuIniciarSesion').click();
    
    // Buscar enlace de olvido de contraseña
    await page.getByRole('link', { name: /olvidad|olvidé|recuperar/i }).click();
    
    // Verificar que estamos en página de recuperación
    await expect(page).toHaveURL(/.*forgot|.*recover|.*reset/);
    
    // Rellenar email
    await page.getByRole('textbox', { name: /Email|email/i }).fill('borrar@prueba.com');
    await page.getByRole('button', { name: /Enviar|Recuperar|Continuar/i }).click();
    
    // Verificar confirmación
    await expect(page.getByText(/enviado|correo|check.*email/i)).toBeVisible({ timeout: 5000 });
  });
});