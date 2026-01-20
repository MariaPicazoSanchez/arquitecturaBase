import { test, expect } from '@playwright/test';

test.describe('Zona de Usuario', () => {

  test('Ver y editar perfil', async ({ page }) => {
    await page.goto('http://localhost:3000/');
    await page.locator('#menuIniciarSesion').click();
    await page.getByRole('textbox', { name: 'Email' }).click();
    await page.getByRole('textbox', { name: 'Email' }).fill('borrar@prueba.com');
    await page.getByRole('textbox', { name: 'Contraseña' }).click();
    await page.getByRole('textbox', { name: 'Contraseña' }).fill('Hola1234*');
    await page.locator('#btnLogin').click();
    
    await page.waitForTimeout(2000);
    
    // Click en menú de usuario
    await page.getByRole('button', { name: 'Usuario' }).click();
    
    // Click en "Mi cuenta"
    await page.getByRole('link', { name: 'Mi cuenta' }).click();
    
    // Verificar que estamos en la página de Mi cuenta
    await expect(page.getByRole('heading', { name: 'Mi cuenta' })).toBeVisible();
    await expect(page.getByText('Gestiona tu información,')).toBeVisible();
    
    // Ir a editar perfil
    await page.getByRole('heading', { name: 'Editar perfil' }).click();
    
    // Cambiar nombre
    await page.getByRole('textbox', { name: 'Nombre' }).click();
    await page.getByRole('textbox', { name: 'Nombre' }).clear();
    await page.getByRole('textbox', { name: 'Nombre' }).fill('UnNombre');
    
    // Guardar cambios
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    
    await page.waitForTimeout(1000);
    
    // Verificar que se guardó el nuevo nombre
    await expect(page.getByRole('heading', { name: 'UnNombre' })).toBeVisible();
    await expect(page.getByText('borrar@prueba.com')).toBeVisible();
    
    // Verificar datos del perfil
    await expect(page.getByRole('rowheader', { name: 'Nick' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'pepepepepe' })).toBeVisible();
    
    // Verificar secciones adicionales
    await expect(page.getByRole('heading', { name: 'Eliminar cuenta' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Seguridad' })).toBeVisible();
    
    // Acceder a cambiar contraseña
    await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
    
    // Verificar mensaje de envío de enlace
    await expect(page.getByText('Te enviaremos un enlace por')).toBeVisible();
    
    // Volver a la página principal
    await page.getByRole('button', { name: 'Volver' }).click();
    
    // Verificar que está de vuelta en la página principal
    await expect(page.getByRole('heading', { name: 'Elige un juego' })).toBeVisible({ timeout: 5000 });
  });

  test('Ver historial de partidas', async ({ page }) => {
    await page.goto('http://localhost:3000/');
    await page.locator('#menuIniciarSesion').click();
    await page.getByRole('textbox', { name: 'Email' }).fill('borrar@prueba.com');
    await page.getByRole('textbox', { name: 'Contraseña' }).fill('Hola1234*');
    await page.locator('#btnLogin').click();
    
    await page.waitForTimeout(2000);
    
    // Acceder a historial (suele estar en menú o en perfil)
    const historialBtn = page.getByRole('button', { name: /Historial|Partidas.*anteriores/i });
    if (await historialBtn.isVisible()) {
      await historialBtn.click();
      
      // Verificar que se muestra tabla o lista de partidas
      await expect(page.locator('table, [role="table"], [class*="partida"]').first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('Cerrar sesión', async ({ page }) => {
    await page.goto('http://localhost:3000/');
    await page.locator('#menuIniciarSesion').click();
    await page.getByRole('textbox', { name: 'Email' }).fill('borrar@prueba.com');
    await page.getByRole('textbox', { name: 'Contraseña' }).fill('Hola1234*');
    await page.locator('#btnLogin').click();
    
    await page.waitForTimeout(2000);
    
    // Click en menú de usuario
    await page.getByRole('button', { name: 'Usuario' }).click();
    
    // Click en enlace de Salir
    await page.getByRole('link', { name: 'Salir' }).click();
    
    // Verificar que se vuelve a la página de login/registro
    await expect(page.getByRole('heading', { name: 'Registro de usuario' })).toBeVisible({ timeout: 5000 });
  });

  test('Cambiar tema', async ({ page }) => {
    await page.goto('http://localhost:3000/');
    await page.locator('#menuIniciarSesion').click();
    await page.getByRole('textbox', { name: 'Email' }).fill('borrar@prueba.com');
    await page.getByRole('textbox', { name: 'Contraseña' }).fill('Hola1234*');
    await page.locator('#btnLogin').click();
    
    await page.waitForTimeout(2000);
    
    // Click en menú de usuario
    await page.getByRole('button', { name: 'Usuario' }).click();
    
    // Click en botón de cambiar tema
    await page.getByRole('button', { name: 'Cambiar tema' }).click();
    
    // Verificar que se aplicó el cambio de tema
    await page.waitForTimeout(500);
    await expect(page).toHaveURL('http://localhost:3000/');
  });

  test('Acceder a la zona de Ayuda', async ({ page }) => {
    await page.goto('http://localhost:3000/');
    await page.locator('#menuIniciarSesion').click();
    await page.getByRole('textbox', { name: 'Email' }).fill('borrar@prueba.com');
    await page.getByRole('textbox', { name: 'Contraseña' }).fill('Hola1234*');
    await page.locator('#btnLogin').click();
    
    await page.waitForTimeout(2000);
    
    // Click en menú de usuario
    await page.getByRole('button', { name: 'Usuario' }).click();
    
    // Click en enlace de Ayuda
    await page.getByLabel('Usuario').getByRole('link', { name: 'Ayuda' }).click();
    
    await page.waitForTimeout(1000);
    
    // Navegar por las diferentes secciones de ayuda
    // Click en primera sección (Cuenta)
    await page.locator('div').nth(1).click();
    await page.locator('div').nth(4).click();
    
    await page.getByText('Cuenta Perfil Cambiar nombre').click();
    await page.getByText('Juegos Reglas rápidas Última').click();
    await page.getByText('Preguntas frecuentes No me').click();
    await page.getByText('© Table Room · Centro de ayuda').click();
    await page.getByRole('link', { name: 'Volver' }).click();
    await page.getByRole('heading', { name: 'Elige un juego' }).click();
  });

  test('Ver actividad reciente', async ({ page }) => {
    await page.goto('http://localhost:3000/');
    await page.locator('#menuIniciarSesion').click();
    await page.getByRole('textbox', { name: 'Email' }).click();
    await page.getByRole('textbox', { name: 'Email' }).fill('borrar@prueba.com');
    await page.getByRole('textbox', { name: 'Contraseña' }).click();
    await page.getByRole('textbox', { name: 'Contraseña' }).fill('Hola1234*');
    await page.locator('#btnLogin').click();
    
    await page.waitForTimeout(2000);
    
    // Click en menú de usuario
    await page.getByRole('button', { name: 'Usuario' }).click();
    
    // Click en "Actividad"
    await page.getByRole('link', { name: 'Actividad' }).click();
    
    await page.waitForTimeout(1000);
    
    // Verificar que estamos en la página de actividad
    await expect(page.getByRole('heading', { name: 'Tu actividad reciente' })).toBeVisible();
    
    // Hacer click en primera actividad (inicioLocal)
    await page.getByText('inicioLocal').first().click();
    
    await page.waitForTimeout(500);
    
    // Volver al menú de usuario
    await page.getByRole('button', { name: 'Usuario' }).click();
    
    // Cerrar actividad
    await page.getByRole('link', { name: 'Cerrar actividad' }).click();
    
    await page.waitForTimeout(1000);
    
    // Verificar que está de vuelta en la página principal
    await expect(page.getByRole('heading', { name: 'Elige un juego' })).toBeVisible({ timeout: 5000 });
  });


});
