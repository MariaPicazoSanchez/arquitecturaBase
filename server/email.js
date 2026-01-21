const nodemailer = require('nodemailer');
let transporter;
// PRODUCCIÓN
if (process.env.NODE_ENV == 'production') {
  const gv = require('./gestorVariables.js');

  let options = {
    user: "",
    pass: ""
  };


  gv.obtenerOptions(function (res) {
    options = res;

    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: options
    });

    console.log("[email] Transporter inicializado con correo de:", options.user);
  });
} else {
// DESARROLLO LOCAL
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.MAIL_FROM,
      pass: process.env.MAIL_PASS
    }
  });
}

module.exports.enviarEmail = async function(direccion, key, men) {
  // Si no hay transporter, esperar a que esté listo
  if (!transporter) {
    await new Promise(resolve => {
      const checkInterval = setInterval(() => {
        if (transporter) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, 5000); // timeout de 5 segundos
    });
  }

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

  const fromEmail = process.env.NODE_ENV === 'production' ? process.env.MAIL_FROM : process.env.MAIL_FROM;

  await transporter.sendMail({
    from: fromEmail,
    to: direccion,
    subject: men || "Confirmar cuenta",
    text: `Bienvenido a Sistema\n\nConfirma tu cuenta aquí:\n${confirmUrl}\n`,
    html
  });
};