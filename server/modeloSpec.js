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

  
})

describe("Pruebas de las partidas", function(){
  let sistema, usr, usr2, usr3;

  beforeEach(function(){
    sistema = new modelo.Sistema();
    usr  = { nick: "Pepa", email: "pepa@pepa.es" };
    usr2 = { nick: "Pepo", email: "pepo@pepo.es" };
    usr3 = { nick: "Pepe", email: "pepe@pepe.es" };
    sistema.agregarUsuario(usr.email);
    sistema.agregarUsuario(usr2.email);
    sistema.agregarUsuario(usr3.email);
  });

  it("Usuarios y partidas en el sistema", function(){
    expect(sistema.numeroUsuarios()).toEqual(3);
    expect(sistema.obtenerPartidasDisponibles().length).toEqual(0);
  });

  it("Crear partida", function(){
    let codigo = sistema.crearPartida(usr.email);
    expect(codigo).not.toEqual(-1);
    let lista = sistema.obtenerPartidasDisponibles();
    expect(lista.length).toEqual(1);
    expect(lista[0].codigo).toEqual(codigo);
    expect(lista[0].propietario).toEqual(usr.email);
  });

  it("Unir a partida y completar aforo", function(){
    let codigo = sistema.crearPartida(usr.email);
    let res = sistema.unirAPartida(usr2.email, codigo);
    expect(res.codigo).toEqual(codigo);
    // al estar llena (2 jugadores) ya no est�� disponible
    const lista = sistema.obtenerPartidasDisponibles();
    expect(lista.length).toEqual(1);
    expect(lista[0].codigo).toEqual(codigo);
    expect(lista[0].status).toEqual("FULL");
    // un tercer jugador no puede unirse
    let res3 = sistema.unirAPartida(usr3.email, codigo);
    expect(res3.codigo).toEqual(-1);
    expect(res3.reason).toEqual("FULL");
  });

  it("Un usuario no puede estar dos veces en la misma partida", function(){
    let codigo = sistema.crearPartida(usr.email);
    let res1 = sistema.unirAPartida(usr2.email, codigo);
    let res2 = sistema.unirAPartida(usr2.email, codigo);
    expect(res1.codigo).toEqual(codigo);
    expect(res2.codigo).toEqual(-1);
    expect(res2.reason).toEqual("ALREADY_IN");
  });

  it("Obtener partidas disponibles devuelve c��digo y propietario", function(){
    let codigo = sistema.crearPartida(usr.email);
    let lista = sistema.obtenerPartidasDisponibles();
    const found = Array.isArray(lista) && lista.some(p => p && p.codigo === codigo && p.propietario === usr.email);
    expect(found).toBe(true);
  });
});
