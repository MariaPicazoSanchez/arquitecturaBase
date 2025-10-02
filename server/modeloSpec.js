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
})