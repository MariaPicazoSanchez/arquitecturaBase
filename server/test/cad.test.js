import { describe, it, expect, beforeEach } from 'vitest';
import { CAD } from '../cad.js';
import { ObjectId } from 'mongodb';

describe('CAD (Data Access Layer) Tests', () => {
  let cad;
  let mockUsers;
  let mockTokens;

  beforeEach(() => {
    cad = new CAD();
    
    // Mock de colecciones en memoria
    mockUsers = {};
    mockTokens = {};

    // Crear mocks para las colecciones
    cad.usuarios = {
      findOne: async (criteria) => {
        return Object.values(mockUsers).find(u => {
          for (const [key, val] of Object.entries(criteria)) {
            if (u[key] !== val) return false;
          }
          return true;
        });
      },
      insertOne: async (doc) => {
        const id = new ObjectId();
        doc._id = id;
        mockUsers[id.toString()] = doc;
        return { insertedId: id };
      },
      updateOne: async (criteria, update) => {
        const user = Object.values(mockUsers).find(u => {
          for (const [key, val] of Object.entries(criteria)) {
            if (u[key] !== val) return false;
          }
          return true;
        });
        if (user && update.$set) {
          Object.assign(user, update.$set);
          return { modifiedCount: 1 };
        }
        return { modifiedCount: 0 };
      },
      findOneAndUpdate: async (criteria, update) => {
        const user = Object.values(mockUsers).find(u => {
          for (const [key, val] of Object.entries(criteria)) {
            if (u[key] !== val) return false;
          }
          return true;
        });
        if (user) {
          if (update.$set) Object.assign(user, update.$set);
          return { value: user };
        }
        return { value: null };
      },
      deleteOne: async (criteria) => {
        const ids = Object.keys(mockUsers).filter(id => {
          const user = mockUsers[id];
          for (const [key, val] of Object.entries(criteria)) {
            if (user[key] !== val) return false;
          }
          return true;
        });
        if (ids.length > 0) {
          delete mockUsers[ids[0]];
          return { deletedCount: 1 };
        }
        return { deletedCount: 0 };
      }
    };

    cad.passwordResetTokens = {
      findOne: async (criteria) => {
        return Object.values(mockTokens).find(t => {
          for (const [key, val] of Object.entries(criteria)) {
            if (t[key] !== val) return false;
          }
          return true;
        });
      },
      find: (criteria) => ({
        sort: () => ({
          limit: () => ({
            toArray: async () => {
              return Object.values(mockTokens).filter(t => {
                for (const [key, val] of Object.entries(criteria)) {
                  if (t[key] !== val) return false;
                }
                return true;
              });
            }
          })
        })
      }),
      insertOne: async (doc) => {
        const id = new ObjectId();
        doc._id = id;
        mockTokens[id.toString()] = doc;
        return { insertedId: id };
      },
      updateOne: async (criteria, update) => {
        const token = Object.values(mockTokens).find(t => {
          for (const [key, val] of Object.entries(criteria)) {
            if (t[key] !== val) return false;
          }
          return true;
        });
        if (token && update.$set) {
          Object.assign(token, update.$set);
          return { modifiedCount: 1 };
        }
        return { modifiedCount: 0 };
      },
      deleteMany: async (criteria) => {
        const ids = Object.keys(mockTokens).filter(id => {
          const token = mockTokens[id];
          for (const [key, val] of Object.entries(criteria)) {
            if (token[key] !== val) return false;
          }
          return true;
        });
        ids.forEach(id => delete mockTokens[id]);
        return { deletedCount: ids.length };
      }
    };

    cad.logs = {
      insertOne: async () => ({ insertedId: 'log_1' })
    };
  });

  describe('User Search Operations', () => {
    it('should search user by email', async () => {
      const testUser = {
        email: 'test@example.com',
        nick: 'testuser',
        password: 'hashed',
        confirmada: true
      };
      mockUsers['1'] = testUser;

      await new Promise((resolve) => {
        cad.buscarUsuario({ email: 'test@example.com' }, (result) => {
          expect(result).toBeDefined();
          expect(result.email).toBe('test@example.com');
          resolve();
        });
      });
    });

    it('should return undefined when user not found', async () => {
      await new Promise((resolve) => {
        cad.buscarUsuario({ email: 'nonexistent@example.com' }, (result) => {
          expect(result).toBeUndefined();
          resolve();
        });
      });
    });

    it('should search user with projection (public data)', async () => {
      const testUser = {
        email: 'public@example.com',
        nick: 'publicuser',
        password: 'secret',
        displayName: 'Public User'
      };
      mockUsers['1'] = testUser;

      await new Promise((resolve) => {
        cad.buscarUsuarioPublico({ email: 'public@example.com' }, (result) => {
          expect(result).toBeDefined();
          expect(result.email).toBe('public@example.com');
          expect(result.nick).toBe('publicuser');
          resolve();
        });
      });
    });
  });

  describe('User Update Operations', () => {
    it('should update user by email', async () => {
      const testUser = {
        email: 'email@example.com',
        nick: 'emailuser',
        displayName: 'Old Name'
      };
      mockUsers['1'] = testUser;

      await new Promise((resolve) => {
        cad.actualizarUsuarioPorEmail('email@example.com', { displayName: 'New Name' }, (result) => {
          expect(result.email).toBe('email@example.com');
          expect(testUser.displayName).toBe('New Name');
          resolve();
        });
      });
    });

    it('should return undefined when updating non-existent user', async () => {
      await new Promise((resolve) => {
        cad.actualizarUsuarioPorEmail('nonexistent@example.com', { displayName: 'New Name' }, (result) => {
          expect(result).toBeUndefined();
          resolve();
        });
      });
    });

    it('should handle empty patch in update', async () => {
      const testUser = {
        email: 'empty@example.com',
        nick: 'emptyuser'
      };
      mockUsers['1'] = testUser;

      await new Promise((resolve) => {
        cad.actualizarUsuarioPorEmail('empty@example.com', {}, (result) => {
          expect(result.email).toBe('empty@example.com');
          resolve();
        });
      });
    });
  });

  describe('User Insert Operations', () => {
    it('should insert a new user', async () => {
      const newUser = {
        email: 'new@example.com',
        nick: 'newuser',
        password: 'hashed'
      };

      await new Promise((resolve) => {
        cad.insertarUsuario(newUser, (result) => {
          expect(result.email).toBe('new@example.com');
          expect(Object.keys(mockUsers).length).toBeGreaterThan(0);
          resolve();
        });
      });
    });
  });

  describe('User Delete Operations', () => {
    it('should delete user by email', async () => {
      const testUser = {
        email: 'delete@example.com',
        nick: 'deleteuser'
      };
      mockUsers['1'] = testUser;

      await new Promise((resolve) => {
        cad.eliminarUsuarioPorEmail('delete@example.com', (result) => {
          expect(result).toBe(true);
          expect(Object.values(mockUsers).find(u => u.email === 'delete@example.com')).toBeUndefined();
          resolve();
        });
      });
    });

    it('should return false when deleting non-existent user', async () => {
      await new Promise((resolve) => {
        cad.eliminarUsuarioPorEmail('nonexistent@example.com', (result) => {
          expect(result).toBe(false);
          resolve();
        });
      });
    });
  });

  describe('Password Reset Token Operations', () => {
    it('should insert password reset token', async () => {
      const token = {
        tokenHash: 'hash123',
        userId: new ObjectId(),
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
        usedAt: null
      };

      await new Promise((resolve) => {
        cad.insertarPasswordResetToken(token, (result) => {
          expect(result).toBeDefined();
          expect(result.tokenHash).toBe('hash123');
          resolve();
        });
      });
    });

    it('should search token by hash', async () => {
      const tokenDoc = {
        tokenHash: 'searchhash',
        userId: new ObjectId(),
        usedAt: null
      };
      mockTokens['1'] = tokenDoc;

      await new Promise((resolve) => {
        cad.buscarPasswordResetTokenPorHash('searchhash', (result) => {
          expect(result).toBeDefined();
          expect(result.tokenHash).toBe('searchhash');
          resolve();
        });
      });
    });

    it('should return undefined for non-existent token hash', async () => {
      await new Promise((resolve) => {
        cad.buscarPasswordResetTokenPorHash('nonexistenthash', (result) => {
          expect(result).toBeUndefined();
          resolve();
        });
      });
    });

    it('should delete tokens for user', async () => {
      const userId = new ObjectId();
      mockTokens['1'] = { userId: userId, tokenHash: 'token1' };
      mockTokens['2'] = { userId: userId, tokenHash: 'token2' };
      mockTokens['3'] = { userId: new ObjectId(), tokenHash: 'token3' };

      await new Promise((resolve) => {
        cad.eliminarPasswordResetTokensDeUsuario(userId, (result) => {
          expect(result).toBe(true);
          resolve();
        });
      });
    });
  });

  describe('Log Operations', () => {
    it('should insert log entry', async () => {
      const result = await cad.insertarLog('testOperation', 'user@example.com');
      expect(result).toBeDefined();
      expect(result.insertedId).toBe('log_1');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid criteria object', async () => {
      await new Promise((resolve) => {
        cad.buscarUsuario(null, (result) => {
          expect(result).toBeUndefined();
          resolve();
        });
      });
    });

    it('should handle database timeout gracefully', async () => {
      cad.usuarios.findOne = async () => {
        await new Promise(r => setTimeout(r, 10));
        return undefined;
      };

      await new Promise((resolve) => {
        cad.buscarUsuario({ email: 'timeout@example.com' }, (result) => {
          expect(result).toBeUndefined();
          resolve();
        });
      });
    });
  });
});
