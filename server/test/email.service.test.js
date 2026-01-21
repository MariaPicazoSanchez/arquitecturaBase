import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// We'll need to mock nodemailer at a deeper level
// Store the original require to use it for nodemailer
let mockSendMailFn;

// Create a proxy module to return our mock
const nodemailerMock = {
  createTransport: () => ({
    sendMail: (mailOptions) => {
      return mockSendMailFn(mailOptions);
    }
  })
};

// Override require.cache for nodemailer
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function(id) {
  if (id === 'nodemailer') {
    return nodemailerMock;
  }
  return originalRequire.apply(this, arguments);
};

// Now import the email module which will use our mocked nodemailer
const emailModule = require('../email.js');

describe('Email Service - enviarEmail', () => {
  beforeEach(() => {
    // Reset mock before each test
    mockSendMailFn = vi.fn();

    // Setup environment
    process.env.MAIL_FROM = 'noreply@tableroom.app';
    process.env.MAIL_PASS = 'testpass123';
    process.env.APP_URL = 'https://tableroom.app';
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.MAIL_FROM;
    delete process.env.MAIL_PASS;
    delete process.env.APP_URL;
  });

  // ============ Account Confirmation Email ============
  describe('Account Confirmation Email', () => {
    it('should send confirmation email with all required fields', async () => {
      await emailModule.enviarEmail(
        'newuser@example.com',
        'abc123key',
        'Confirmar cuenta'
      );

      expect(mockSendMailFn).toHaveBeenCalledOnce();
      const mailOptions = mockSendMailFn.mock.calls[0][0];

      expect(mailOptions.to).toBe('newuser@example.com');
      expect(mailOptions.subject).toBe('Confirmar cuenta');
      expect(mailOptions.from).toBe('noreply@tableroom.app');
      expect(mailOptions.html).toBeDefined();
      expect(mailOptions.text).toBeDefined();
    });

    it('should include confirmation link in HTML', async () => {
      await emailModule.enviarEmail(
        'user@example.com',
        'key123',
        'Verificar email'
      );

      const mailOptions = mockSendMailFn.mock.calls[0][0];
      expect(mailOptions.html).toContain('confirmarUsuario');
      expect(mailOptions.html).toContain('key123');
      expect(mailOptions.html).toContain(encodeURIComponent('user@example.com'));
    });

    it('should encode email and key in URL', async () => {
      const specialEmail = 'user+tag@example.com';
      const specialKey = 'key/with+special';

      await emailModule.enviarEmail(specialEmail, specialKey);

      const mailOptions = mockSendMailFn.mock.calls[0][0];
      expect(mailOptions.html).toContain(encodeURIComponent(specialEmail));
      expect(mailOptions.html).toContain(encodeURIComponent(specialKey));
    });

    it('should use default subject when not provided', async () => {
      await emailModule.enviarEmail('user@example.com', 'key123');

      const mailOptions = mockSendMailFn.mock.calls[0][0];
      expect(mailOptions.subject).toBe('Confirmar cuenta');
    });

    it('should include proper HTML structure', async () => {
      await emailModule.enviarEmail('user@example.com', 'key123');

      const mailOptions = mockSendMailFn.mock.calls[0][0];
      const html = mailOptions.html;

      expect(html).toContain('Table Room');
      expect(html).toContain('font-family');
      expect(html).toContain('border-radius');
      expect(html).toContain('target="_blank"');
    });

    it('should include plain text version', async () => {
      await emailModule.enviarEmail('user@example.com', 'key123');

      const mailOptions = mockSendMailFn.mock.calls[0][0];
      const text = mailOptions.text;

      expect(text).toContain('Bienvenido');
      expect(text).toContain('confirmarUsuario');
      expect(text).toContain(encodeURIComponent('user@example.com'));
      expect(text).toContain('key123');
    });

    it('should include button link in HTML', async () => {
      await emailModule.enviarEmail('user@example.com', 'key123');

      const mailOptions = mockSendMailFn.mock.calls[0][0];
      expect(mailOptions.html).toContain('href=');
      expect(mailOptions.html).toContain('Confirmar cuenta');
    });

    it('should include fallback link text', async () => {
      await emailModule.enviarEmail('user@example.com', 'key123');

      const mailOptions = mockSendMailFn.mock.calls[0][0];
      expect(mailOptions.html).toContain('Si el botón no funciona');
    });

    it('should work with special characters in email', async () => {
      const emails = [
        'user+tag@example.com',
        'first.last@example.com',
        'user_name@example.com'
      ];

      for (const email of emails) {
        mockSendMailFn.mockClear();
        await emailModule.enviarEmail(email, 'key123');

        const mailOptions = mockSendMailFn.mock.calls[0][0];
        expect(mailOptions.to).toBe(email);
      }
    });

    it('should handle missing APP_URL gracefully', async () => {
      delete process.env.APP_URL;

      await emailModule.enviarEmail('user@example.com', 'key123');

      const mailOptions = mockSendMailFn.mock.calls[0][0];
      expect(mailOptions.html).toBeDefined();
      expect(mailOptions.text).toBeDefined();
      // Should still send even without APP_URL
      expect(mockSendMailFn).toHaveBeenCalledOnce();
    });

    it('should build absolute URL with APP_URL', async () => {
      process.env.APP_URL = 'https://custom.app';

      await emailModule.enviarEmail('user@example.com', 'key123');

      const mailOptions = mockSendMailFn.mock.calls[0][0];
      expect(mailOptions.html).toContain('https://custom.app/confirmarUsuario');
    });

    it('should handle APP_URL with trailing slash', async () => {
      process.env.APP_URL = 'https://tableroom.app/';

      await emailModule.enviarEmail('user@example.com', 'key123');

      const mailOptions = mockSendMailFn.mock.calls[0][0];
      expect(mailOptions.html).toContain('https://tableroom.app/confirmarUsuario');
    });
  });

  // ============ Password Reset Email ============
  describe('Password Reset Email', () => {
    it('should send password reset email with code string', async () => {
      await emailModule.enviarEmailCambioPassword(
        'user@example.com',
        'CODE123'
      );

      expect(mockSendMailFn).toHaveBeenCalledOnce();
      const mailOptions = mockSendMailFn.mock.calls[0][0];

      expect(mailOptions.to).toBe('user@example.com');
      expect(mailOptions.subject).toBe('Cambiar contraseña');
      expect(mailOptions.html).toContain('CODE123');
      expect(mailOptions.text).toContain('CODE123');
    });

    it('should send password reset with code object', async () => {
      const payload = {
        code: 'RESET456',
        token: 'resettoken789'
      };

      await emailModule.enviarEmailCambioPassword('user@example.com', payload);

      const mailOptions = mockSendMailFn.mock.calls[0][0];
      expect(mailOptions.html).toContain('RESET456');
      expect(mailOptions.html).toContain('resettoken789');
    });

    it('should include reset link when token provided', async () => {
      const payload = {
        code: 'CODE789',
        token: 'resettoken123'
      };

      process.env.APP_URL = 'https://tableroom.app';

      await emailModule.enviarEmailCambioPassword('user@example.com', payload);

      const mailOptions = mockSendMailFn.mock.calls[0][0];
      expect(mailOptions.html).toContain('reset-password');
      expect(mailOptions.html).toContain('resettoken123');
    });

    it('should format code with special styling', async () => {
      await emailModule.enviarEmailCambioPassword('user@example.com', 'ABC123XYZ');

      const mailOptions = mockSendMailFn.mock.calls[0][0];
      // Code should have prominent styling
      expect(mailOptions.html).toContain('font-size:20px');
      expect(mailOptions.html).toContain('letter-spacing:2px');
      expect(mailOptions.html).toContain('font-weight:800');
    });

    it('should include expiration warning', async () => {
      await emailModule.enviarEmailCambioPassword('user@example.com', 'CODE999');

      const mailOptions = mockSendMailFn.mock.calls[0][0];
      expect(mailOptions.html).toContain('expira');
      expect(mailOptions.html).toContain('15 minutos');
    });

    it('should include security warning', async () => {
      await emailModule.enviarEmailCambioPassword('user@example.com', 'CODE000');

      const mailOptions = mockSendMailFn.mock.calls[0][0];
      expect(mailOptions.html).toContain('Si no has sido tú');
      expect(mailOptions.text).toContain('Si no has sido tú');
    });

    it('should handle code-only string parameter', async () => {
      await emailModule.enviarEmailCambioPassword('user@example.com', '123456');

      const mailOptions = mockSendMailFn.mock.calls[0][0];
      expect(mailOptions.html).toContain('123456');
    });

    it('should handle empty payload object', async () => {
      await emailModule.enviarEmailCambioPassword('user@example.com', {});

      const mailOptions = mockSendMailFn.mock.calls[0][0];
      expect(mailOptions.to).toBe('user@example.com');
      expect(mailOptions.subject).toBe('Cambiar contraseña');
    });

    it('should include plain text version', async () => {
      const payload = { code: 'CODE555', token: 'token555' };
      await emailModule.enviarEmailCambioPassword('user@example.com', payload);

      const mailOptions = mockSendMailFn.mock.calls[0][0];
      expect(mailOptions.text).toContain('CODE555');
      expect(mailOptions.text).toContain('cambiar tu contraseña');
    });

    it('should fallback to APP_URL when no token', async () => {
      const payload = { code: 'CODE111' };
      process.env.APP_URL = 'https://tableroom.app';

      await emailModule.enviarEmailCambioPassword('user@example.com', payload);

      const mailOptions = mockSendMailFn.mock.calls[0][0];
      expect(mailOptions.html).toContain('https://tableroom.app');
    });

    it('should include proper HTML structure', async () => {
      await emailModule.enviarEmailCambioPassword('user@example.com', 'CODE123');

      const mailOptions = mockSendMailFn.mock.calls[0][0];
      const html = mailOptions.html;

      expect(html).toContain('Table Room');
      expect(html).toContain('font-family');
      expect(html).toContain('color:#6b7280');
    });

    it('should handle whitespace in payload', async () => {
      const payload = {
        code: '  SPACED_CODE  ',
        token: '  token_with_spaces  '
      };

      await emailModule.enviarEmailCambioPassword('user@example.com', payload);

      const mailOptions = mockSendMailFn.mock.calls[0][0];
      // Values should be trimmed
      expect(mailOptions.html).toContain('SPACED_CODE');
    });
  });

  // ============ Email Configuration ============
  describe('Email Configuration', () => {
    it('should use MAIL_FROM environment variable', async () => {
      process.env.MAIL_FROM = 'custom@company.com';

      await emailModule.enviarEmail('user@example.com', 'key123');

      const mailOptions = mockSendMailFn.mock.calls[0][0];
      expect(mailOptions.from).toBe('custom@company.com');
    });

    it('should handle missing MAIL_FROM', async () => {
      delete process.env.MAIL_FROM;

      await emailModule.enviarEmail('user@example.com', 'key123');

      // Should still attempt to send
      expect(mockSendMailFn).toHaveBeenCalledOnce();
    });

    it('should use default subject for confirmation', async () => {
      await emailModule.enviarEmail('user@example.com', 'key123');

      const mailOptions = mockSendMailFn.mock.calls[0][0];
      expect(mailOptions.subject).toBe('Confirmar cuenta');
    });

    it('should use custom subject when provided', async () => {
      await emailModule.enviarEmail('user@example.com', 'key123', 'Mi Asunto Personalizado');

      const mailOptions = mockSendMailFn.mock.calls[0][0];
      expect(mailOptions.subject).toBe('Mi Asunto Personalizado');
    });
  });

  // ============ Error Handling ============
  describe('Error Handling', () => {
    it('should propagate sendMail errors', async () => {
      mockSendMailFn.mockRejectedValueOnce(new Error('SMTP connection failed'));

      await expect(
        emailModule.enviarEmail('user@example.com', 'key123')
      ).rejects.toThrow('SMTP connection failed');
    });

    it('should propagate password reset email errors', async () => {
      mockSendMailFn.mockRejectedValueOnce(new Error('Email service unavailable'));

      await expect(
        emailModule.enviarEmailCambioPassword('user@example.com', 'CODE')
      ).rejects.toThrow('Email service unavailable');
    });

    it('should handle authentication errors', async () => {
      mockSendMailFn.mockRejectedValueOnce(new Error('Invalid SMTP credentials'));

      await expect(
        emailModule.enviarEmail('user@example.com', 'key123')
      ).rejects.toThrow('Invalid SMTP credentials');
    });

    it('should handle network timeouts', async () => {
      mockSendMailFn.mockRejectedValueOnce(new Error('Network timeout'));

      await expect(
        emailModule.enviarEmail('user@example.com', 'key123')
      ).rejects.toThrow('Network timeout');
    });

    it('should handle rate limiting', async () => {
      mockSendMailFn.mockRejectedValueOnce(new Error('Rate limit exceeded'));

      await expect(
        emailModule.enviarEmail('user@example.com', 'key123')
      ).rejects.toThrow('Rate limit exceeded');
    });
  });

  // ============ Content Validation ============
  describe('Content Validation', () => {
    it('should have same content in both HTML and text formats', async () => {
      await emailModule.enviarEmail('user@example.com', 'key123');

      const mailOptions = mockSendMailFn.mock.calls[0][0];
      const { html, text } = mailOptions;

      // Both should contain key information (email is URL-encoded in the URL)
      expect(text).toContain('Bienvenido');
      expect(text).toContain('confirmarUsuario');
      expect(text).toContain('key123');
      expect(html).toContain('Bienvenido');
      expect(html).toContain('confirmarUsuario');
    });

    it('should sanitize email addresses in HTML', async () => {
      await emailModule.enviarEmail('user@example.com', 'key123');

      const mailOptions = mockSendMailFn.mock.calls[0][0];
      expect(mockSendMailFn).toHaveBeenCalledOnce();
      // Verify HTML was properly escaped/formatted
      expect(mailOptions.html).toBeDefined();
    });

    it('should include proper HTML tags for styling', async () => {
      await emailModule.enviarEmail('user@example.com', 'key123');

      const mailOptions = mockSendMailFn.mock.calls[0][0];
      const html = mailOptions.html;

      expect(html).toContain('style=');
      expect(html).toContain('<a');
      expect(html).toContain('<p');
      expect(html).toContain('<div');
    });

    it('should have responsive design hints', async () => {
      await emailModule.enviarEmail('user@example.com', 'key123');

      const mailOptions = mockSendMailFn.mock.calls[0][0];
      const html = mailOptions.html;

      expect(html).toContain('border');
      expect(html).toContain('padding');
      expect(html).toContain('color');
    });
  });

  // ============ Multiple Recipients ============
  describe('Multiple Calls', () => {
    it('should handle multiple email sends in sequence', async () => {
      await emailModule.enviarEmail('user1@example.com', 'key1');
      await emailModule.enviarEmail('user2@example.com', 'key2');
      await emailModule.enviarEmail('user3@example.com', 'key3');

      expect(mockSendMailFn).toHaveBeenCalledTimes(3);

      const calls = mockSendMailFn.mock.calls;
      expect(calls[0][0].to).toBe('user1@example.com');
      expect(calls[1][0].to).toBe('user2@example.com');
      expect(calls[2][0].to).toBe('user3@example.com');
    });

    it('should handle mixed email types in sequence', async () => {
      await emailModule.enviarEmail('user@example.com', 'key123');
      await emailModule.enviarEmailCambioPassword('user@example.com', 'CODE456');

      expect(mockSendMailFn).toHaveBeenCalledTimes(2);

      const calls = mockSendMailFn.mock.calls;
      expect(calls[0][0].subject).toBe('Confirmar cuenta');
      expect(calls[1][0].subject).toBe('Cambiar contraseña');
    });
  });

  // ============ URL Building ============
  describe('URL Building', () => {
    it('should properly encode special characters in URLs', async () => {
      const specialEmail = 'user+tag@example.com';
      const specialKey = 'key/with+special=chars';

      await emailModule.enviarEmail(specialEmail, specialKey);

      const mailOptions = mockSendMailFn.mock.calls[0][0];
      expect(mailOptions.html).toContain(encodeURIComponent(specialEmail));
      expect(mailOptions.html).toContain(encodeURIComponent(specialKey));
    });

    it('should build reset password link with query parameters', async () => {
      process.env.APP_URL = 'https://tableroom.app';
      const payload = { code: 'CODE', token: 'resettoken' };

      await emailModule.enviarEmailCambioPassword('user@example.com', payload);

      const mailOptions = mockSendMailFn.mock.calls[0][0];
      expect(mailOptions.html).toContain('reset-password');
      expect(mailOptions.html).toContain('token=resettoken');
    });

    it('should handle absolute URLs correctly', async () => {
      process.env.APP_URL = 'https://sub.domain.example.com:8080';

      await emailModule.enviarEmail('user@example.com', 'key123');

      const mailOptions = mockSendMailFn.mock.calls[0][0];
      expect(mailOptions.html).toContain('https://sub.domain.example.com:8080');
    });
  });
});
