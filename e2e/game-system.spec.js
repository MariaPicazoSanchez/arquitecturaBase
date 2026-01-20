import { test, expect } from '@playwright/test';

test.describe('Sistema de partidas', () => {
  test('Crear partida unica Última carta', async ({ page }) => {
    await page.goto('http://localhost:3000/');
    await page.locator('#menuIniciarSesion').click();
    await page.getByRole('textbox', { name: 'Email' }).click();
    await page.getByRole('textbox', { name: 'Email' }).fill('borrar@prueba.com');
    await page.getByRole('textbox', { name: 'Contraseña' }).click();
    await page.getByRole('textbox', { name: 'Contraseña' }).fill('Hola1234*');
    await page.locator('#btnLogin').click();
    await page.getByRole('button', { name: 'Entrar' }).first().click();
    await page.getByRole('button', { name: 'Crear partida' }).click();
    await page.getByLabel('Modo').selectOption('PVBOT');
    await page.getByRole('button', { name: 'Crear', exact: true }).click();
    await page.getByRole('button', { name: '⛶' }).click();
    await page.getByRole('button', { name: '⛶' }).click();
    await page.getByRole('button', { name: 'Salir al lobby' }).click();
  });

  test('Iniciar y abandonar partida con bot en 4 en raya', async ({ page }) => {
    await page.goto('http://localhost:3000/');
    await page.locator('#menuIniciarSesion').click();
    await page.getByRole('textbox', { name: 'Email' }).click();
    await page.getByRole('textbox', { name: 'Email' }).fill('borrar@prueba.com');
    await page.getByRole('textbox', { name: 'Contraseña' }).click();
    await page.getByRole('textbox', { name: 'Contraseña' }).fill('Hola1234*');
    await page.locator('#btnLogin').click();
    await page.getByRole('button', { name: 'Entrar' }).nth(1).click();
    await page.getByRole('button', { name: 'Crear partida' }).click();
    await page.getByLabel('Modo').selectOption('PVBOT');
    await page.getByRole('button', { name: 'Crear', exact: true }).click();
    await page.getByRole('button', { name: '⛶' }).click();
    await page.locator('#iframe-juego').contentFrame().getByRole('button', { name: 'Soltar ficha en columna 5' }).click();
    await page.getByRole('button', { name: '⛶' }).click();
    await page.getByRole('button', { name: 'Abandonar' }).click();
  });

  test('Partida multiplayer PVP - Última carta', async ({ browser }) => {
    // Dos contextos para dos usuarios independientes
    const contextHost = await browser.newContext();
    const contextGuest = await browser.newContext();
    const host = await contextHost.newPage();
    const guest = await contextGuest.newPage();

    try {
      // Host crea partida
      await host.goto('http://localhost:3000/');
      await host.locator('#menuIniciarSesion').click();
      await host.getByRole('textbox', { name: 'Email' }).fill('borrar@prueba.com');
      await host.getByRole('textbox', { name: 'Contraseña' }).fill('Hola1234*');
      await host.locator('#btnLogin').click();
      await host.getByRole('button', { name: 'Entrar' }).first().click();
      await host.getByRole('button', { name: 'Crear partida' }).click();
      await host.getByRole('button', { name: 'Crear', exact: true }).click();

      // Invitado se une a la partida existente de Última carta
      await guest.goto('http://localhost:3000/');
      await guest.locator('#menuIniciarSesion').click();
      await guest.getByRole('textbox', { name: 'Email' }).fill('usuario.prueba2@mail.com');
      await guest.getByRole('textbox', { name: 'Contraseña' }).fill('Hola1234+');
      await guest.locator('#btnLogin').click();
      await guest.getByRole('button', { name: 'Entrar' }).first().click();
      await guest.getByText('Última carta · Usuario · 1/2').click();
      await guest.locator('#tbody-partidas').getByRole('button', { name: 'Unirse' }).click();
      await guest.getByText('Última carta · Usuario · 2/2').click();
      await guest.getByText('Participantes: Usuario,').click();
      
      // Host arranca la partida tras tener 2/2
      await host.getByText('Última carta · Usuario · 2/2').click();
      await host.getByRole('button', { name: 'Jugar' }).click();
      
      await guest.getByRole('heading', { name: 'Juego: Última carta' }).click();
      await host.getByRole('heading', { name: 'Juego: Última carta' }).click();
      // Esperar a que ambos carguen el iframe de juego
      const hostFrame = host.frameLocator('#iframe-juego');
      const guestFrame = guest.frameLocator('#iframe-juego');
      await hostFrame.locator('div').first().waitFor({ timeout: 5000 });
      await guestFrame.locator('div').first().waitFor({ timeout: 5000 });

        // // Turno host (acción mínima) y luego guest siguiendo la secuencia que compartiste
      const hostContent = await host.locator('#iframe-juego').contentFrame();
      const guestContent = await guest.locator('#iframe-juego').contentFrame();

        // Guest realiza la secuencia especificada
      await guest.getByRole('heading', { name: 'Juego: Última carta' }).click();
      await host.getByRole('heading', { name: 'Juego: Última carta' }).click();
      await hostContent.locator('div').filter({ hasText: /^UUsuario\(7\)TÚTURNO$/ }).nth(1).click();
      await hostContent.getByText('Turno:Usuario (7)Última').click();
      await guestContent.locator('div').filter({ hasText: /^UUsuario\(7\)TÚSIGUIENTE$/ }).nth(0).click();
      await guestContent.getByText('Turno:Usuario (7)Última').click();

    } finally {
      // Cerrar contextos sin fallar si ya están cerrados
      await Promise.allSettled([
        contextHost.close(),
        contextGuest.close(),
      ]);
    }
  });

  test('Partida multiplayer abandono', async ({ browser }) => {
    const contextHost = await browser.newContext();
    const contextGuest = await browser.newContext();
    const host = await contextHost.newPage();
    const guest = await contextGuest.newPage();

    try {
      // Host crea partida
      await host.goto('http://localhost:3000/');
      await host.locator('#menuIniciarSesion').click();
      await host.getByRole('textbox', { name: 'Email' }).click();
      await host.getByRole('textbox', { name: 'Email' }).fill('borrar@prueba.com');
      await host.getByRole('textbox', { name: 'Contraseña' }).click();
      await host.getByRole('textbox', { name: 'Contraseña' }).fill('Hola1234*');
      await host.locator('#btnLogin').click();
      await host.getByRole('button', { name: 'Entrar' }).first().click();
      await host.getByRole('button', { name: 'Crear partida' }).click();
      await host.getByRole('button', { name: 'Crear', exact: true }).click();

      // Guest se une
      await guest.goto('http://localhost:3000/');
      await guest.locator('#menuIniciarSesion').click();
      await guest.getByRole('textbox', { name: 'Email' }).click();
      await guest.getByRole('textbox', { name: 'Email' }).fill('usuario.prueba2@mail.com');
      await guest.getByRole('textbox', { name: 'Contraseña' }).click();
      await guest.getByRole('textbox', { name: 'Contraseña' }).fill('Hola1234+');
      await guest.locator('#btnLogin').click();
      await guest.getByText('Bienvenido a Table Room,').click();
      await guest.getByRole('button', { name: 'Entrar' }).first().click();
      // await guest.getByText('Última carta · Usuario · 1/2').click();
      await guest.locator('#tbody-partidas').getByRole('button', { name: 'Unirse' }).click();
      // Guest ve que fue unido y entra al juego
      await guest.getByText('Unido').click();
      await guest.getByText('Última carta · Usuario · 2/2').click();

      // Host espera 2/2 y arranca la partida
      await host.getByText('Última carta · Usuario · 2/2').click();
      await host.getByRole('button', { name: 'Jugar' }).click();
      await host.getByRole('heading', { name: 'Juego: Última carta' }).click();
      await guest.getByRole('heading', { name: 'Juego: Última carta' }).click();


      // Esperar a que ambos carguen el iframe
      const hostFrame = host.frameLocator('#iframe-juego');
      const guestFrame = guest.frameLocator('#iframe-juego');
      await hostFrame.locator('div').first().waitFor({ timeout: 5000 });
      await guestFrame.locator('div').first().waitFor({ timeout: 5000 });

      // Host abandona desde dentro del juego
      await host.getByRole('button', { name: 'Abandonar' }).click();

      // Guest ve la notificación de abandono dentro del iframe
      const guestContent = await guest.locator('#iframe-juego').contentFrame();
      await guestContent.getByText('Usuario abandonó la partida.').click();
      await guest.getByRole('button', { name: 'Salir al lobby' }).click();

    } finally {
      await Promise.allSettled([
        contextHost.close(),
        contextGuest.close(),
      ]);
    }
  });

  test('Partida multiplayer PVP - 4 en raya', async ({ browser }) => {
    const contextHost = await browser.newContext();
    const contextGuest = await browser.newContext();
    const host = await contextHost.newPage();
    const guest = await contextGuest.newPage();

    try {
      // Host crea partida de 4 en raya
      await host.goto('http://localhost:3000/');
      await host.locator('#menuIniciarSesion').click();
      await host.getByRole('textbox', { name: 'Email' }).fill('borrar@prueba.com');
      await host.getByRole('textbox', { name: 'Contraseña' }).fill('Hola1234*');
      await host.locator('#btnLogin').click();
      await host.getByRole('button', { name: 'Entrar' }).nth(1).click(); // Botón de 4 en raya
      await host.getByRole('button', { name: 'Crear partida' }).click();
      await host.getByRole('button', { name: 'Crear', exact: true }).click();

      // Guest se une a la partida
      await guest.goto('http://localhost:3000/');
      await guest.locator('#menuIniciarSesion').click();
      await guest.getByRole('textbox', { name: 'Email' }).fill('usuario.prueba2@mail.com');
      await guest.getByRole('textbox', { name: 'Contraseña' }).fill('Hola1234+');
      await guest.locator('#btnLogin').click();
      await guest.getByRole('button', { name: 'Entrar' }).nth(1).click(); // Botón de 4 en raya
      await guest.locator('#tbody-partidas').getByRole('button', { name: 'Unirse' }).click();

      // Host arranca la partida cuando ambos están listos
      await host.waitForTimeout(1000);
      await host.getByRole('button', { name: 'Jugar' }).click();

      // Esperar a que el juego cargue
      await host.waitForTimeout(2000);
      await guest.waitForTimeout(2000);

      // Verificar que ambos ven el tablero
      const hostFrame = host.frameLocator('#iframe-juego');
      const guestFrame = guest.frameLocator('#iframe-juego');
      await hostFrame.getByRole('button', { name: /Soltar ficha en columna/ }).first().waitFor({ timeout: 5000 });
      await guestFrame.locator('div').first().waitFor({ timeout: 5000 });

      // Host juega primera ficha
      const hostContent = await host.locator('#iframe-juego').contentFrame();
      await hostContent.getByRole('button', { name: 'Soltar ficha en columna 4' }).click();

      // Esperar turno de guest y jugar
      await guest.waitForTimeout(1000);
      const guestContent = await guest.locator('#iframe-juego').contentFrame();
      await guestContent.getByRole('button', { name: 'Soltar ficha en columna 3' }).click();

      // Host juega otra vez
      await host.waitForTimeout(1000);
      await hostContent.getByRole('button', { name: 'Soltar ficha en columna 4' }).click();

      // Salir al lobby
      await host.getByRole('button', { name: 'Salir al lobby' }).click();
      await guest.getByRole('button', { name: 'Salir al lobby' }).click();

    } finally {
      await Promise.allSettled([
        contextHost.close(),
        contextGuest.close(),
      ]);
    }
  });

  test('Partida multiplayer PVP - Damas', async ({ browser }) => {
    const contextHost = await browser.newContext();
    const contextGuest = await browser.newContext();
    const host = await contextHost.newPage();
    const guest = await contextGuest.newPage();

    try {
      // Host crea partida de Damas
      await host.goto('http://localhost:3000/');
      await host.locator('#menuIniciarSesion').click();
      await host.getByRole('textbox', { name: 'Email' }).fill('borrar@prueba.com');
      await host.getByRole('textbox', { name: 'Contraseña' }).fill('Hola1234*');
      await host.locator('#btnLogin').click();
      await host.getByRole('button', { name: 'Entrar' }).nth(2).click(); // Botón de Damas
      await host.getByRole('button', { name: 'Crear partida' }).click();
      await host.getByRole('button', { name: 'Crear', exact: true }).click();

      // Guest se une a la partida de Damas
      await guest.goto('http://localhost:3000/');
      await guest.locator('#menuIniciarSesion').click();
      await guest.getByRole('textbox', { name: 'Email' }).fill('usuario.prueba2@mail.com');
      await guest.getByRole('textbox', { name: 'Contraseña' }).fill('Hola1234+');
      await guest.locator('#btnLogin').click();
      await guest.getByRole('button', { name: 'Entrar' }).nth(2).click(); // Botón de Damas
      await guest.locator('#tbody-partidas').getByRole('button', { name: 'Unirse' }).click();

      // Host arranca la partida cuando ambos están listos
      await host.waitForTimeout(1000);
      await host.getByRole('button', { name: 'Jugar' }).click();

      // Esperar a que el juego cargue
      await host.waitForTimeout(2000);
      await guest.waitForTimeout(2000);

      // Verificar que ambos ven el tablero de Damas
      await host.getByRole('heading', { name: 'Juego: Damas' }).click();
      await guest.getByRole('heading', { name: 'Juego: Damas' }).click();

      const hostContent = await host.locator('#iframe-juego').contentFrame();
      const guestContent = await guest.locator('#iframe-juego').contentFrame();

      // Verificar elementos del juego
      await hostContent.locator('div').filter({ hasText: /^Turno: Blancas$/ }).waitFor({ timeout: 5000 });
      await guestContent.locator('div').filter({ hasText: /^Turno: Blancas$/ }).waitFor({ timeout: 5000 });

      // Verificar turnos Blancas/Negras
      await hostContent.getByText('Blancas:').click();
      await hostContent.getByText('Negras:').click();
      await guestContent.getByText('Blancas:').click();
      await guestContent.getByText('Negras:').click();

      // Salir al lobby desde ambos
      await host.getByRole('button', { name: 'Salir al lobby' }).click();
      
      // Guest puede continuar y luego salir
      await guest.waitForTimeout(500);
      await guest.getByRole('button', { name: 'Salir al lobby' }).click();

    } finally {
      await Promise.allSettled([
        contextHost.close(),
        contextGuest.close(),
      ]);
    }
  });
});