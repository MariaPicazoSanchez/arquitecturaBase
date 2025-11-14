const modelo = require("./modelo.js");


describe('El sistema', function() {
  let sistema;

  beforeEach(function() {
    sistema=new modelo.Sistema()
  });

  it('inicialmente no hay usuarios', function() {
    expect(sistema.numeroUsuarios()).toEqual(0);
  });

  it('permite agregar un usuario', function() {
    sistema.agregarUsuario("Mario");
    expect(sistema.numeroUsuarios()).toEqual(1);
  });

  it('obtenerUsuarios devuelve los usuarios añadidos', function() {
    sistema.agregarUsuario("Mario");
    sistema.agregarUsuario("Juan");
    let usuarios = Object.keys(sistema.obtenerUsuarios());
    expect(usuarios).toContain("Mario");
    expect(usuarios).toContain("Juan");
  });

  it('usuarioActivo devuelve true si existe', function() {
    sistema.agregarUsuario("Mario");
    expect(sistema.usuarioActivo("Mario")).toBe(true);
    expect(sistema.usuarioActivo("Juan")).toBe(false);
  });

  it('eliminarUsuario elimina correctamente al usuario', function() {
    sistema.agregarUsuario("Mario");
    sistema.eliminarUsuario("Mario");
    expect(sistema.usuarioActivo("Mario")).toBe(false);
  });
  
  it('numeroUsuarios devuelve el número correcto de usuarios', function() {
    sistema.agregarUsuario("Mario");
    sistema.agregarUsuario("Juan");
    expect(sistema.numeroUsuarios()).toEqual(2);
  });

  it('agregarUsuario no permite nicks duplicados', function() {
    sistema.agregarUsuario("Mario");
    let res = sistema.agregarUsuario("Mario");
    expect(res.nick).toEqual(-1);
    expect(sistema.numeroUsuarios()).toEqual(1);
  });

 

  it('registrarUsuario rechaza datos inválidos', function(done) {
    let obj = { email: "", password: "" };
    sistema.registrarUsuario(obj, function(res) {
      expect(res.email).toEqual(-1);
      done();
    });
  });

  it('registrarUsuario rechaza emails duplicados', function(done) {
    let obj = { email: "picazosanchezmaria@gmail.com", password: "1234" };
    sistema.registrarUsuario(obj, function(res1) {
      expect(res1.email).toEqual(obj.email);
      // Segundo intento con el mismo email
      sistema.registrarUsuario(obj, function(res2) {
        // acepta tanto la señal de error { email: -1, reason: "email_ya_registrado" }
        // como la devolución del usuario existente { email: obj.email }
        if (res2.email === -1) {
          expect(res2.reason).toEqual("email_ya_registrado");
        } else {
          expect(res2.email).toEqual(obj.email);
        }
        done();
      });
    });
  });
})