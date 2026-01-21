const nodemailer = require('nodemailer');

let transporter;
let options = { user: '', pass: '' };
let initPromise;

async function initTransporter() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    if (process.env.NODE_ENV === 'production') {
      const gv = require('./gestorVariables.js');
      options = await gv.obtenerOptions();
      transporter = nodemailer.createTransport({ service: 'gmail', auth: options });
      console.log('[email] Transporter inicializado con correo de:', options.user);
    } else {
      options = { user: process.env.MAIL_FROM, pass: process.env.MAIL_PASS };
      transporter = nodemailer.createTransport({ service: 'gmail', auth: options });
    }
  })();
  return initPromise;
}

module.exports.enviarEmail = async function(direccion, key, men) {
  await initTransporter();

  const APP_URL = process.env.APP_URL;
  const confirmUrl = `${APP_URL}/confirmarUsuario/${encodeURIComponent(direccion)}/${encodeURIComponent(key)}`;

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#111">
      <p>Bienvenido a <strong>Sistema</strong></p>

      <!-- Botón compatible con Outlook (usa tabla) -->
      <table role="presentation" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td align="center" bgcolor="#2563EB" style="border-radius:6px;">
            <a href="${confirmUrl}" target="_blank" 
              style="display:inline-block;padding:12px 18px;color:#ffffff;text-decoration:none;font-weight:bold;">
              Confirmar cuenta
            </a>
          </td>
        </tr>
      </table>

      <p style="margin-top:16px">Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
      <p><a href="${confirmUrl}" target="_blank">${confirmUrl}</a></p>
    </div>
  `;

  const fromEmail = options.user || process.env.MAIL_FROM;

  await transporter.sendMail({
    from: fromEmail,
    to: direccion,
    subject: men || "Confirmar cuenta",
    text: `Bienvenido a Sistema\n\nConfirma tu cuenta aquí:\n${confirmUrl}\n`,
    html
  });
};