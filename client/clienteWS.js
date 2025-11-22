function ClienteWS() {
    this.socket = null;
    this.email = null;
    this.codigo = null;

    this._ensureEmail = function(){
        if (!this.email && window.$ && $.cookie){
            this.email = $.cookie("nick") || $.cookie("email") || this.email;
        }
        return this.email;
    };

    this.pedirListaPartidas = function(){
        if (this.socket){
            this.socket.emit("obtenerListaPartidas");
        }
    };

    this.ini = function () {
        let ws = this;
        this.socket = io();

        this.lanzarServidorWS();

        this.socket.on("connect", function(){
            ws._ensureEmail();
            ws.pedirListaPartidas();
            setTimeout(() => ws.pedirListaPartidas(), 100); // asegurar recepción tras registrar handlers
        });
    };

    this.lanzarServidorWS = function() {
      let ws = this;

      this.socket.on("listaPartidas", function(lista){
        console.log("Lista de partidas recibida:", lista);
        if (window.cw && cw.pintarPartidas){
            cw.pintarPartidas(lista);
        }
        try { window._ultimaListaPartidas = lista; } catch(e){}
      });

      this.socket.on("partidaCreada", function(datos){
          console.log("Partida creada:", datos.codigo);
          ws.codigo = datos.codigo;
          ws.pedirListaPartidas();
      });

      this.socket.on("unidoAPartida", function(datos){
          console.log("Unido a partida:", datos.codigo);
          ws.codigo = datos.codigo;
          ws.pedirListaPartidas();
      });

      this.socket.on("partidaContinuada", function(datos){
          console.log("Continuando partida:", datos.codigo);
          ws.codigo = datos.codigo;
      });

      this.socket.on("partidaEliminada", function(datos){
          console.log("Partida eliminada:", datos.codigo);
          ws.pedirListaPartidas();
      });
    };

  // === Metodos que llama la interfaz / consola ===

  this.crearPartida = function(){
    if (!this._ensureEmail()){
        console.warn("No hay email en ws, no se puede crear partida.");
        return;
    }
    this.socket.emit("crearPartida", { email: this.email });
  };

  this.continuarPartida = function(codigo){
      if (!this._ensureEmail()){
          console.warn("No hay email en ws, no se puede continuar partida.");
          return;
      }
      this.socket.emit("continuarPartida", { email: this.email, codigo: codigo });
  };

  this.unirAPartida = function(codigo){
      if (!this._ensureEmail()){
          console.warn("No hay email en ws, no se puede unir a partida.");
          return;
      }
      this.socket.emit("unirAPartida", { email: this.email, codigo: codigo });
  };

  this.eliminarPartida = function(codigo){
      if (!this._ensureEmail()){
          console.warn("No hay email en ws, no se puede eliminar partida.");
          return;
      }
      this.socket.emit("eliminarPartida", { email: this.email, codigo: codigo });
  };

  this.ini();
}
