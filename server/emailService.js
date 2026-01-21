const nodemailer = require("nodemailer");
const logger = require("./logger");
const gv = require("./gestorVariables");

let transporter = null;
let initPromise = null;
let currentCreds = null;

const isProd = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";

const TRANSIENT_CODES = new Set(["ETIMEDOUT", "ECONNRESET", "EHOSTUNREACH", "ESOCKETTIMEDOUT", "EAI_AGAIN"]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const nowMs = () => Number(process.hrtime.bigint()) / 1e6;

const sanitizeBaseUrl = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.replace(/\/+$/, "");
};

const pickEnv = (name) => String(process.env[name] || "").trim();

const getFromAddress = (creds) =>
  pickEnv("MAIL_FROM") ||
  pickEnv("SMTP_USER") ||
  (creds && creds.user) ||
  (currentCreds && currentCreds.user) ||
  "no-reply@tableroom.app";

async function resolveCredentials() {
  const start = nowMs();
  if (!isProd) {
    const user = pickEnv("MAIL_FROM") || pickEnv("SMTP_USER");
    const pass = pickEnv("MAIL_PASS") || pickEnv("SMTP_PASS") || pickEnv("SMTP_PASSWORD");
    if (!user || !pass) {
      throw new Error("MAIL_FROM/MAIL_PASS requeridos para SMTP en desarrollo");
    }
    logger.debug(`[email] usando credenciales de entorno en ${Math.round(nowMs() - start)}ms`);
    return { user, pass };
  }

  return new Promise((resolve, reject) => {
    gv.obtenerOptions((opts) => {
      try {
        logger.info(`[email] credenciales obtenidas de Secret Manager en ${Math.round(nowMs() - start)}ms`);
        resolve({ user: opts.user, pass: opts.pass });
      } catch (err) {
        reject(err);
      }
    }).catch((err) => {
      reject(err);
    });
  });
}

function buildTransportConfig(creds) {
  const base = {
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: creds.user, pass: creds.pass },
    pool: !isTest,
    maxConnections: 3,
    maxMessages: 100,
    rateLimit: 5,
    rateDelta: 1000,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    tls: { rejectUnauthorized: true },
    name: "tableroom-backend",
  };

  if (!isProd && !process.env.MAIL_USE_SSL) {
    base.port = 587;
    base.secure = false;
    base.requireTLS = true;
  }

  return base;
}

async function verifyTransporter(tx) {
  const start = nowMs();
  if (typeof tx.verify !== "function") return;
  try {
    await tx.verify();
    logger.info(`[email] verify OK en ${Math.round(nowMs() - start)}ms`);
  } catch (err) {
    logger.warn(`[email] verify fallo en ${Math.round(nowMs() - start)}ms: ${err && err.message}`);
  }
}

async function initEmailTransporter(force = false) {
  if (transporter && !force) return transporter;
  if (initPromise && !force) return initPromise;

  initPromise = (async () => {
    const creds = await resolveCredentials();
    currentCreds = creds;
    const cfg = buildTransportConfig(creds);
    const t0 = nowMs();
    transporter = nodemailer.createTransport(cfg);
    logger.info(
      `[email] transporter creado en ${Math.round(nowMs() - t0)}ms (host:${cfg.host}, pool:${!!cfg.pool})`
    );
    await verifyTransporter(transporter);
    return transporter;
  })().catch((err) => {
    transporter = null;
    initPromise = null;
    logger.error("[email] initEmailTransporter fallo:", err && err.message ? err.message : err);
    throw err;
  });

  return initPromise;
}

function isTransientError(err) {
  if (!err) return false;
  if (TRANSIENT_CODES.has(err.code)) return true;
  const msg = String(err.message || "").toLowerCase();
  return msg.includes("timeout") || msg.includes("timed out") || msg.includes("connection closed") || msg.includes("rate limit");
}

async function sendEmail(mailOptions) {
  const tx = await initEmailTransporter();
  const mail = { ...mailOptions };
  if (!mail.to || !mail.subject) {
    throw new Error("Parámetros inválidos: to y subject son requeridos");
  }
  if (!mail.from) mail.from = getFromAddress(currentCreds);

  const maxAttempts = isTest ? 1 : 3;
  const backoffMs = [0, 700, 1500];
  let lastErr;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const start = nowMs();
    try {
      const info = await tx.sendMail(mail);
      logger.info(
        `[email] sendMail OK to:${mail.to} intento:${attempt} latency:${Math.round(nowMs() - start)}ms id:${info && info.messageId}`
      );
      return info;
    } catch (err) {
      lastErr = err;
      const transient = isTransientError(err);
      logger.warn(
        `[email] sendMail error intento:${attempt}/${maxAttempts} transient:${transient} code:${err && err.code} msg:${err && err.message}`
      );
      if (!transient || attempt === maxAttempts) break;
      await sleep(backoffMs[Math.min(attempt, backoffMs.length - 1)]);
    }
  }
  throw lastErr;
}

function buildConfirmationContent(email, key, subject) {
  const base = sanitizeBaseUrl(process.env.APP_URL || process.env.FRONTEND_URL || process.env.CLIENT_URL || "");
  const confirmUrl = base
    ? `${base}/confirmarUsuario/${encodeURIComponent(email)}/${encodeURIComponent(key)}`
    : `/confirmarUsuario/${encodeURIComponent(email)}/${encodeURIComponent(key)}`;

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#111">
      <p>Bienvenido a <strong>Table Room</strong></p>
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

  const text = `Bienvenido a Table Room\n\nConfirma tu cuenta aquí:\n${confirmUrl}\n`;

  return {
    to: email,
    subject: subject || "Confirmar cuenta",
    html,
    text,
  };
}

function buildResetContent(email, payload) {
  const raw = payload && typeof payload === "object" ? payload : { code: payload };
  const code = String((raw.code || raw)).trim();
  const token = String(raw.token || "").trim();
  const base = sanitizeBaseUrl(process.env.APP_URL || process.env.API_URL || "");
  const resetUrl = token && base ? `${base}/reset-password?token=${encodeURIComponent(token)}` : "";

  const subject = "Cambiar contraseña";
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#111">
      <p>Hola,</p>
      <p>Usa este código para cambiar tu contraseña:</p>
      <div style="margin:12px 0;padding:12px 16px;background:#f4f6fb;border:1px solid #e5e7eb;border-radius:8px;">
        <div style="font-size:20px;letter-spacing:2px;font-weight:800;color:#111;text-align:center;">${code}</div>
      </div>
      ${resetUrl ? `<p>O haz click en este enlace:</p><p><a href="${resetUrl}" target="_blank">${resetUrl}</a></p>` : ""}
      ${token ? `<p>Token: <code style="font-family:monospace;">${token}</code></p>` : ""}
      <p style="color:#6b7280;">El código expira en 15 minutos.</p>
      <p style="color:#6b7280;">Si no has sido tú, ignora este mensaje.</p>
    </div>
  `;

  const textLines = [
    "Hola,",
    "Usa este código para cambiar tu contraseña:",
    code,
    token ? `Token: ${token}` : null,
    resetUrl ? `Enlace: ${resetUrl}` : null,
    "El código expira en 15 minutos.",
    "Si no has sido tu, ignora este mensaje.",
  ].filter(Boolean);

  return { to: email, subject, html, text: textLines.join("\n") };
}

async function enviarEmail(direccion, key, men) {
  const mail = buildConfirmationContent(direccion, key, men);
  mail.from = getFromAddress(currentCreds);
  return sendEmail(mail);
}

async function enviarEmailCambioPassword(direccion, payload) {
  const mail = buildResetContent(direccion, payload);
  mail.from = getFromAddress(currentCreds);
  return sendEmail(mail);
}

module.exports = {
  initEmailTransporter,
  sendEmail,
  enviarEmail,
  enviarEmailCambioPassword,
  buildConfirmationContent,
  buildResetContent,
  _unsafeGetTransporter: () => transporter,
};
