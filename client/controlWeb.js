    // Verifica si el usuario tiene una partida activa (no usar email en UI).
    this.tienePartidaPropia = function(lista) {
        const norm = (v) => String(v || "").trim().toLowerCase();
        const myUserId = norm($.cookie && $.cookie("uid"));
        const myNick = norm($.cookie && $.cookie("nick"));
        if (!myUserId && !myNick) return false;
        return Array.isArray(lista) && lista.some(p =>
            (myUserId && norm(p && p.hostUserId) === myUserId) ||
            (!myUserId && myNick && norm(p && p.propietario) === myNick)
        );
    };
function ControlWeb() {
        // Verifica si el usuario tiene una partida activa
        this.tienePartidaPropia = function(lista) {
            const norm = (v) => String(v || "").trim().toLowerCase();
            const myUserId = norm($.cookie && $.cookie("uid"));
            const myNick = norm($.cookie && $.cookie("nick"));
            if (!myUserId && !myNick) return false;
            return Array.isArray(lista) && lista.some(p =>
                (myUserId && norm(p && p.hostUserId) === myUserId) ||
                (!myUserId && myNick && norm(p && p.propietario) === myNick)
            );
        };
    this.juegoActual = null;

    // Theme (Light/Dark): persist + apply via documentElement.dataset.theme
    this._getTheme = function(){
        try {
            const t = localStorage.getItem("theme");
            if (t === "dark") return "dark";
        } catch(e) {}
        return "light";
    };
    this._applyTheme = function(theme){
        const t = theme === "dark" ? "dark" : "light";
        try { document.documentElement.dataset.theme = t; } catch(e) {}
        try { localStorage.setItem("theme", t); } catch(e) {}
        return t;
    };

    this._updateMainVisibility = function(){
        const a = $.trim($("#au").html());
        const r = $.trim($("#registro").html());
        const m = $.trim($("#msg").html());
        const empty = (!a && !r && !m);
        if (empty){
            $("#mainContent").hide();
        } else {
            $("#mainContent").show();
        }
    };

    this.mostrarJuegoEnApp = function(juego, codigo){
        // Guardamos qué juego estamos mostrando
        this.juegoActual = juego || this.juegoActual || "uno";

        // Track current match for "leave" / resume cleanups
        this._activeCodigo = codigo || null;
        this._activeGameType = this.juegoActual;

        const nombreBonito =
            this.juegoActual === "uno"    ? "Última carta" :
            this.juegoActual === "4raya"  ? "4 en raya" :
            this.juegoActual === "damas" || this.juegoActual === "checkers" ? "Damas" :
            this.juegoActual === "hundir" ? "Hundir la flota" :
            this.juegoActual;

        $("#titulo-juego-actual").text("Juego: " + nombreBonito);

        // URL del juego (iframe)
        let url =
            this.juegoActual === "4raya" ? "/4raya" :
            this.juegoActual === "damas" || this.juegoActual === "checkers" ? "/damas" :
            this.juegoActual === "uno"   ? "/uno" :
            "/uno";
        if (codigo){
            url += "?codigo=" + encodeURIComponent(codigo);
        }

        $("#iframe-juego").attr("src", url);
        $("#selector-juegos").hide();
        $("#panel-partidas").hide();
        $("#zona-juego").show();

        this._updateMainVisibility();

        // Ensure the outer socket stays subscribed to the match room for system toasts / resume checks.
        try {
            const email =
                cw.email ||
                (window.ws && ws.email) ||
                (window.$ && $.cookie && ($.cookie("email") || (($.cookie("nick") && String($.cookie("nick")).includes("@")) ? $.cookie("nick") : ""))) ||
                null;
            if (window.ws && ws.socket && codigo && email) {
                ws.socket.emit("match:resume", { matchCode: String(codigo), email: email });
            }
        } catch(e) {}

        // Scroll suave hasta el juego
        try {
            $("html, body").animate({
                scrollTop: $("#zona-juego").offset().top - 60
            }, 300);
        } catch(e){}
    };

    this.volverDesdeJuego = function(){
        // Voluntary leave:
        // - UNO: se comporta como "abandonar" (histórico).
        // - Damas/4raya: salida blanda (no abandonar), permite reentrada/continuar.
        try {
            const gameType = cw._normalizeResumeGameType(cw._activeGameType || cw.juegoActual);
            const gameId = String(cw._activeCodigo || (window.ws && ws.codigo) || "").trim();
            const email =
                cw.email ||
                (window.ws && ws.email) ||
                (window.$ && $.cookie && ($.cookie("email") || (($.cookie("nick") && String($.cookie("nick")).includes("@")) ? $.cookie("nick") : ""))) ||
                null;

            const isUno = gameType === "uno";
            const key = cw._activeGameStorageKeyFor(gameType);

            if (isUno) {
                if (key) {
                    try { localStorage.removeItem(key); } catch(e) {}
                }
                try { localStorage.removeItem("activeMatch"); } catch(e) {}

                if (window.ws && ws.socket && gameId && email) {
                    ws.socket.emit("game:leave", { gameType, gameId, email }, function(){
                        if (window.cw && typeof cw.renderContinueGamesBar === "function") {
                            cw.renderContinueGamesBar();
                        }
                    });
                }
            } else {
                // Soft exit: keep `activeMatch` for PVP games to allow "Continuar partida".
                if (key) {
                    // legacy keys only (UNO/DAMAS) - keep them for Damas to avoid breaking old banner logic
                    // (activeMatch is the source of truth for resume UI).
                }
                // Inform server we left the match UI (disconnect semantics) so that:
                // - other players get a system notification
                // - matches with 0 connected players get destroyed (no "continuar" ghost)
                try {
                    const activeRaw = localStorage.getItem("activeMatch");
                    const active = activeRaw ? JSON.parse(activeRaw) : null;
                    const matchCode = String(active?.matchCode || gameId || "").trim();
                    const isBotMatch = !!active?.isBotMatch;
                    const isPvpResumable =
                        !isBotMatch && (gameType === "damas" || gameType === "4raya");
                    if (isPvpResumable && matchCode && email && window.ws && ws.socket) {
                        ws.socket.emit("match:soft_disconnect", { matchCode, email });
                    }
                } catch(e) {}
                if (window.cw && typeof cw.renderContinueGamesBar === "function") {
                    cw.renderContinueGamesBar();
                }
            }
        } catch(e) {}

        cw._activeCodigo = null;
        cw._activeGameType = null;

        // Paramos el juego (vaciamos el iframe)
        $("#iframe-juego").attr("src", "");

        // Volvemos a ver el selector de juegos y las partidas del juego actual
        $("#zona-juego").hide();
        $("#selector-juegos").show();
        $("#panel-partidas").show();

        // Refrescamos la lista de partidas por si ha cambiado algo
        if (window.ws && typeof ws.pedirListaPartidas === "function"){
            ws.pedirListaPartidas();
        }
        if (window._ultimaListaPartidas){
            this.pintarPartidas(window._ultimaListaPartidas);
        }

        this._updateMainVisibility();
        if (typeof cw.renderContinueGamesBar === "function") {
            cw.renderContinueGamesBar();
        }
    };


    this.mostrarAgregarUsuario=function(){
        $('#bnv').remove();
        $('#mAU').remove();
        let cadena='<div id="mAU">';
        cadena = cadena + '<div class="card"><div class="card-body">';
        cadena = cadena +'<div class="form-group">';
        cadena = cadena + '<label for="nick">Nick:</label>';
        cadena = cadena + '<p><input type="text" class="form-control" id="nick" placeholder="introduce un nick"></p>';
        cadena = cadena + '<button id="btnAU" type="submit" class="btn btn-primary">Submit</button>';
        cadena=cadena+'<div><a href="/auth/google"><img src="./img/G.png" style="height:60px;margin-top:30px"></a></div>';
        cadena = cadena + '</div>';
        cadena = cadena + '</div></div></div>';
        $("#au").append(cadena);

        $("#btnAU").on("click", function() {
            let nick = $("#nick").val().trim();
            if (nick) {
                rest.agregarUsuario(nick);
            } else {
                cw.mostrarMensaje("El nick no puede estar vacío.");
            }
        });
    };

    this.mostrarListaUsuarios = function(){
        $("#au").empty();
        let cadena = '<div id="mLU">';
        cadena += '<h5>Lista de Usuarios</h5>';
        cadena += '<div class="alert alert-info mt-3">Cargando la lista de usuarios...</div>';
        cadena += '<div id="listaUsuarios" class="mt-3"></div>';
        cadena += '</div>';
        
        $("#au").append(cadena);
        rest.obtenerUsuarios();
    };

    this.comprobarSesion=function(){
        let email = $.cookie("email");
        let nick = $.cookie("nick");
        // Compatibilidad: antes `nick` guardaba el email. Si parece email y no hay cookie `email`, usarlo como legacy.
        if (!email && nick && String(nick).includes("@")) email = nick;
        if (email){
            cw.email = String(email).toLowerCase();
            if (window.ws){
                ws.email = cw.email;
                // if (ws.pedirListaPartidas){
                //     ws.pedirListaPartidas();
                // }
            }
            // Verificar sesión real (cookie "nick" puede quedar "stale" si el servidor se reinicia)
            if (window.userService && typeof userService.getMe === "function"){
                userService.getMe()
                    .done(function(me){
                        const label = (me && me.nick) || (nick && !String(nick).includes("@") ? nick : "Usuario");
                        try {
                            // Autoupgrade cookies legacy: antes `nick` pod\u00eda ser el email.
                            if (window.jQuery && $.cookie){
                                if (!$.cookie("email") && cw.email) $.cookie("email", cw.email);
                                if (me && me.nick && !String(me.nick).includes("@")) $.cookie("nick", me.nick);
                                if (!$.cookie("uid") && cw.email) {
                                    const e = String(cw.email || "").trim().toLowerCase();
                                    let hash = 5381;
                                    for (let i = 0; i < e.length; i += 1) {
                                        hash = ((hash << 5) + hash + e.charCodeAt(i)) | 0;
                                    }
                                    $.cookie("uid", (hash >>> 0).toString(36));
                                }
                            }
                        } catch(e2) {}
                        cw._setNavToLogout();
                        cw._setNavUserLabel(label);
                        cw.mostrarSelectorJuegos();
                        if (!sessionStorage.getItem("bienvenidaMostrada")){
                            sessionStorage.setItem("bienvenidaMostrada","1");
                            cw.mostrarMensaje("Bienvenido a Table Room, "+label, "success");
                        }
                    })
                    .fail(function(xhr){
                        if (xhr && xhr.status === 401){
                            try { $.removeCookie('nick'); } catch(e) {}
                            try { $.removeCookie('email'); } catch(e) {}
                            try { $.removeCookie('uid'); } catch(e) {}
                            cw.email = null;
                            if (window.ws){ try { ws.email = null; } catch(e) {} }
                            cw._setNavToLogin();
                            cw.mostrarRegistro();
                            cw.mostrarAviso("Tu sesión ha caducado. Inicia sesión de nuevo.", "error");
                            return;
                        }
                        // fallback best-effort: mantener comportamiento antiguo
                        cw.mostrarSelectorJuegos();
                        cw._setNavToLogout();
                    });
                return;
            }

            // cw.mostrarPartidas();
            cw.mostrarSelectorJuegos();
            if (!sessionStorage.getItem("bienvenidaMostrada")){
                sessionStorage.setItem("bienvenidaMostrada","1");
                cw.mostrarMensaje("Bienvenido a Table Room, "+((nick && !String(nick).includes("@")) ? nick : "Usuario"), "success");
            } else {
                cw._setNavToLogout();
            }
        }else{
            cw._setNavToLogin();
            try {
                const params = new URLSearchParams(window.location.search || "");
                if (params.get("reset") === "1"){
                    cw.mostrarLogin({ keepMessage: true, message: "Contraseña actualizada. Ya puedes iniciar sesión.", messageType: "success" });
                    return;
                }
            } catch(e) {}
            cw.mostrarRegistro();
        }
    };

    // === Selector de juegos ===
    this.mostrarSelectorJuegos = function(){
        // Limpiamos vistas de login/registro/mensajes
        $("#registro").empty();
        $("#au").empty();
        $("#msg").empty();

        // Ocultamos el panel de partidas hasta que elijan juego
        $("#panel-partidas").hide();
        $("#panel-cuenta").hide();
        this._cuentaVisible = false;

        // Mostramos el selector de juegos
        $("#selector-juegos").show();

        cw._updateMainVisibility();
        if (typeof cw.renderContinueGamesBar === "function") {
            cw.renderContinueGamesBar();
        }
    };

    this._normalizeResumeGameType = function(gameType){
        const t = String(gameType || "").trim().toLowerCase();
        if (t === "checkers") return "damas";
        return t;
    };

    this._activeGameStorageKeyFor = function(gameType){
        const t = cw._normalizeResumeGameType(gameType);
        if (t === "uno") return "activeGame:UNO";
        if (t === "damas") return "activeGame:DAMAS";
        return null;
    };

    this.renderContinueGamesBar = function(){
        const $host = $("#continue-games-bar");
        if (!$host.length) return;

        const email =
            cw.email ||
            (window.ws && ws.email) ||
            (window.$ && $.cookie && ($.cookie("email") || (($.cookie("nick") && String($.cookie("nick")).includes("@")) ? $.cookie("nick") : ""))) ||
            null;

        if (!email) {
            $host.hide().empty();
            return;
        }

        if (!window.ws || !ws.socket) {
            setTimeout(() => cw.renderContinueGamesBar(), 150);
            return;
        }

        const safeJsonParse = (raw) => {
            try { return JSON.parse(raw); } catch(e){ return null; }
        };

        // Legacy migration: activeGame:* -> activeMatch (best-effort, without creatorNick).
        try {
            const existing = localStorage.getItem("activeMatch");
            if (!existing) {
                const legacyUno = safeJsonParse(localStorage.getItem("activeGame:UNO"));
                const legacyDamas = safeJsonParse(localStorage.getItem("activeGame:DAMAS"));
                const legacy = legacyUno?.gameId ? { gameKey: "uno", matchCode: legacyUno.gameId } :
                               legacyDamas?.gameId ? { gameKey: "damas", matchCode: legacyDamas.gameId } :
                               null;
                if (legacy?.matchCode) {
                    localStorage.setItem("activeMatch", JSON.stringify({
                        matchCode: String(legacy.matchCode),
                        gameKey: legacy.gameKey,
                        creatorNick: null,
                        joinedAt: Date.now(),
                        isBotMatch: false,
                    }));
                }
            }
        } catch(e) {}

        const active = safeJsonParse((() => {
            try { return localStorage.getItem("activeMatch"); } catch(e){ return null; }
        })());
        const matchCode = String(active?.matchCode || "").trim();
        const savedGameKey = String(active?.gameKey || "").trim().toLowerCase();
        const isBotMatch = !!active?.isBotMatch;
        if (isBotMatch) {
            $host.hide().empty();
            return;
        }

        $host
            .show()
            .html('<div class="text-muted small">Comprobando partidas para continuar…</div>');

        const emitWithTimeout = (event, payload, timeoutMs = 2500) =>
            new Promise((resolve) => {
                let done = false;
                const t = setTimeout(() => {
                    if (done) return;
                    done = true;
                    resolve({ canResume: false, ...payload, reason: "TIMEOUT" });
                }, timeoutMs);

                try {
                    ws.socket.emit(event, payload, (res) => {
                        if (done) return;
                        done = true;
                        clearTimeout(t);
                        resolve(res || { canResume: false, ...payload, reason: "NO_RESPONSE" });
                    });
                } catch (e) {
                    if (done) return;
                    done = true;
                    clearTimeout(t);
                    resolve({ canResume: false, ...payload, reason: "CLIENT_ERROR" });
                }
            });

        let didRenderFromActiveList = false;
        const userId = String((window.$ && $.cookie && $.cookie("uid")) || "").trim().toLowerCase();

        // Prefer server authoritative list (PVP only) when available.
        emitWithTimeout("matches:my_active", { email, userId }, 2500)
            .then((res) => {
                const gotList = !!(res && res.ok && Array.isArray(res.matches));
                const matches = gotList ? res.matches : [];
                // If server returns an authoritative list, remove stale local storage entries
                // that aren't returned (prevents "Continuar" ghosts).
                if (gotList) {
                    try {
                        if (matchCode && Array.isArray(matches)) {
                            const hasSaved = matches.some((m) =>
                                String(m?.matchCode || "").trim() === String(matchCode).trim()
                            );
                            if (!hasSaved) localStorage.removeItem("activeMatch");
                        }
                    } catch(e) {}
                }
                if (gotList) didRenderFromActiveList = true;

                if (matches.length === 0) {
                    // Server is the source of truth: if it returns 0 active matches,
                    // hide the bar and skip legacy `match:can_resume` fallback.
                    $host.hide().empty();
                    return;
                }

                didRenderFromActiveList = true;
                $host.empty();

                const prettyGame = (k) => {
                    const key = String(k || "").trim().toLowerCase();
                    if (key === "4raya") return "4 en raya";
                    if (key === "damas" || key === "checkers") return "Damas";
                    return key || "Juego";
                };

                matches.forEach((m) => {
                    const mc = String(m?.matchCode || "").trim();
                    const gk = String(m?.gameKey || "").trim().toLowerCase();
                    const st = String(m?.status || "").trim().toUpperCase();
                    const creatorNick = String(m?.creatorNick || "Anfitrion").trim();
                    const subtitle =
                        st === "IN_PROGRESS" ? "En curso" :
                        st === "WAITING_START" ? "Sala completa (esperando inicio)" :
                        "";
                    if (!mc || !gk) return;

                    const $card = $('<div class="card shadow-sm mb-2"></div>');
                    const $body = $('<div class="card-body py-2"></div>');
                    const $row = $('<div class="d-flex flex-wrap align-items-center justify-content-between"></div>');
                    const $left = $('<div class="text-muted small mb-2 mb-md-0"></div>')
                        .text(`Continuar partida: ${prettyGame(gk)} - Codigo: ${mc} - Creador: ${creatorNick}${subtitle ? " - " + subtitle : ""}`);
                    const $btn = $('<button type="button" class="btn btn-outline-primary btn-sm mb-2 continue-match-btn"></button>');
                    $btn.attr("data-game-key", gk);
                    $btn.attr("data-match-code", mc);
                    $btn.text("Continuar");

                    $row.append($left);
                    $row.append($btn);
                    $body.append($row);
                    $card.append($body);
                    $host.append($card);
                });

                $host.show();
            })
            .catch(() => {});

        if (!matchCode) return;
        emitWithTimeout("match:can_resume", { matchCode, email, userId }, 2500)
            .then((res) => {
                if (didRenderFromActiveList) return;
                $host.empty();

                if (!res || !res.ok) {
                    const reason = res && res.reason;
                    if (reason && reason !== "TIMEOUT" && reason !== "NO_RESPONSE") {
                        try { localStorage.removeItem("activeMatch"); } catch(e) {}
                    }
                    $host.hide();
                    return;
                }

                const resolvedGameKey = String(res.gameKey || savedGameKey || "").trim().toLowerCase();
                const creatorNick = String(res.creatorNick || active?.creatorNick || "Anfitrión").trim();
                const prettyGame =
                    resolvedGameKey === "uno"    ? "Última Carta" :
                    resolvedGameKey === "4raya"  ? "4 en raya" :
                    (resolvedGameKey === "damas" || resolvedGameKey === "checkers") ? "Damas" :
                    resolvedGameKey || "Juego";

                try {
                    localStorage.setItem("activeMatch", JSON.stringify({
                        matchCode,
                        gameKey: resolvedGameKey || null,
                        creatorNick: creatorNick || null,
                        joinedAt: active?.joinedAt || Date.now(),
                        isBotMatch: false,
                    }));
                } catch(e) {}

                const $card = $('<div class="card shadow-sm"></div>');
                const $body = $('<div class="card-body py-2"></div>');
                const $row = $('<div class="d-flex flex-wrap align-items-center justify-content-between"></div>');
                const $left = $('<div class="text-muted small mb-2 mb-md-0"></div>')
                    .text(`Continuar partida: ${prettyGame} — Código: ${matchCode} — Creador: ${creatorNick || "Anfitrión"}`);
                const $btn = $('<button type="button" class="btn btn-outline-primary btn-sm mb-2 continue-match-btn"></button>');
                $btn.attr("data-game-key", resolvedGameKey);
                $btn.attr("data-match-code", matchCode);
                $btn.text("Continuar");

                $row.append($left);
                $row.append($btn);
                $body.append($row);
                $card.append($body);
                $host.append($card).show();
            })
            .catch(() => {
                $host.hide().empty();
            });
    };

    $(document).on("click", ".continue-match-btn", function(){
        const gameKey = String($(this).data("game-key") || "").trim().toLowerCase();
        const matchCode = String($(this).data("match-code") || "").trim();
        if (!gameKey || !matchCode) return;

        const email =
            cw.email ||
            (window.ws && ws.email) ||
            (window.$ && $.cookie && ($.cookie("email") || (($.cookie("nick") && String($.cookie("nick")).includes("@")) ? $.cookie("nick") : ""))) ||
            null;

        const userId = String((window.$ && $.cookie && $.cookie("uid")) || "").trim().toLowerCase();

        try {
            const raw = localStorage.getItem("activeMatch");
            const parsed = raw ? JSON.parse(raw) : null;
            localStorage.setItem("activeMatch", JSON.stringify({
                matchCode,
                gameKey,
                creatorNick: parsed?.creatorNick || null,
                joinedAt: parsed?.joinedAt || Date.now(),
                isBotMatch: false,
            }));
        } catch(e) {}

        if (window.ws && ws.socket) {
            ws.socket.emit("match:rejoin", { matchCode, email, userId }, function(res){
                if (!res || !res.ok) {
                    const reason = res && res.reason ? String(res.reason) : "NO_RESPONSE";
                    if (reason === "MATCH_NOT_FOUND" || reason === "MATCH_EMPTY") {
                        try { localStorage.removeItem("activeMatch"); } catch(e) {}
                        if (window.cw && typeof cw.renderContinueGamesBar === "function") {
                            cw.renderContinueGamesBar();
                        }
                    }
                    if (window.cw && cw.mostrarAviso) {
                        cw.mostrarAviso("No se pudo continuar la partida.", "error", 4000);
                    }
                    return;
                }

                const status = String(res.status || "").trim().toUpperCase();
                const resolvedGameKey = String(res.gameKey || gameKey || "").trim().toLowerCase();
                if (window.ws){
                    ws.gameType = resolvedGameKey;
                    ws.codigo = matchCode;
                }

                if (status === "IN_PROGRESS") {
                    if (window.cw && typeof cw.mostrarJuegoEnApp === "function") {
                        cw.mostrarJuegoEnApp(resolvedGameKey, matchCode);
                    }
                } else {
                    if (window.cw && typeof cw.seleccionarJuego === "function") {
                        cw.seleccionarJuego(resolvedGameKey);
                    }
                    if (window.cw && cw.mostrarAviso) {
                        cw.mostrarAviso(
                            status === "WAITING_START"
                                ? "Sala completa. Esperando a que el creador inicie..."
                                : "Partida aún no iniciada.",
                            "info"
                        );
                    }
                }
            });
        }
    });

    this.seleccionarJuego = function(juegoId){
        this.juegoActual = juegoId || "uno";

        if (window.ws){
            ws.gameType = this.juegoActual;
        }

        const nombreBonito =
            this.juegoActual === "uno"    ? "Última carta" :
            this.juegoActual === "4raya"  ? "4 en raya" :
            this.juegoActual === "damas" || this.juegoActual === "checkers" ? "Damas" :
            this.juegoActual === "hundir" ? "Hundir la flota" :
            this.juegoActual;

        $("#titulo-partidas-juego").text("Partidas de " + nombreBonito);
        $("#titulo-juego-actual").text("Juego: " + nombreBonito);

        $("#selector-juegos").show();
        $("#panel-partidas").show();
        $("#zona-juego").hide();
        $("#panel-cuenta").hide();
        this._cuentaVisible = false;

        if (window.ws && typeof ws.pedirListaPartidas === "function"){
            ws.pedirListaPartidas();
        }
        if (window._ultimaListaPartidas){
            this.pintarPartidas(window._ultimaListaPartidas);
        }

        this._updateMainVisibility();
    };





    this._avisoTimer = null;

    this.mostrarMensaje=function(msg, tipo="info"){
        $("#au").empty();
        let alertClass = "alert-" + (tipo === "error" ? "danger" : tipo === "success" ? "success" : "info");
        let $alert = $('<div class="alert '+alertClass+' alert-dismissible fade show" role="alert"></div>');
        $alert.text(msg);
        $("#au").append($alert);
        cw._updateMainVisibility();

        if (tipo === "success"){
            cw._setNavToLogout();
            setTimeout(function(){
                $alert.fadeOut(400, function(){ $(this).remove(); cw._updateMainVisibility(); });
            }, 10000);
        }
    };

    this.mostrarAviso=function(msg, tipo="info", duracion=0){
        if (this._avisoTimer) {
            clearTimeout(this._avisoTimer);
            this._avisoTimer = null;
        }
        if (!msg) {
            $("#msg").empty();
            cw._updateMainVisibility();
            return;
        }
        let alertClass = "alert-" + (tipo === "error" ? "danger" : tipo === "success" ? "success" : "info");
        let cadena='<div class="alert '+alertClass+'" role="alert">'+msg+'</div>';
        $("#msg").html(cadena);
        cw._updateMainVisibility();
        if (duracion && Number.isFinite(duracion) && duracion > 0) {
            this._avisoTimer = setTimeout(() => {
                $("#msg").empty();
                cw._updateMainVisibility();
                this._avisoTimer = null;
            }, duracion);
        }
    };

    this.limpiar=function(){
        $("#registro").empty();
        cw._updateMainVisibility();
    };

    this.salir = function(){
        let nick = $.cookie("nick");
        let cadena='<div class="alert alert-info" role="alert">';
        cadena+='Has salido del sistema.';
        cadena+='</div>';
        $("#au").empty();
        $("#au").append(cadena);
        cw._updateMainVisibility();
        if(nick){
            cw.mostrarMensaje("Hasta pronto, " + nick);
        }
        try { sessionStorage.removeItem("bienvenidaMostrada"); } catch(e){}
        $("#panel-cuenta").hide();
        this._cuentaVisible = false;
        rest.salidaDeUsuario();
    };

    this._setNavToLogout = function(){
        const $nav = $(".navbar-nav.ml-auto");
        if (!$nav.length) return;

        // Ayuda visible siempre
        try { $("#menuHelp").closest("li").show(); } catch(e) {}
        try { $("#menuIniciarSesion").closest("li").hide(); } catch(e) {}

        $("#navUserDropdown").remove();
        $("#navUserActions").remove();
        $("#btnSalirNav").closest("li").remove();
        $("#btnVerActividad").closest("li").remove();
        $("#btnMiCuenta").closest("li").remove();
        $("#navUserLabel").remove();

        const $dropdown = $(`
          <li class="nav-item dropdown" id="navUserDropdown">
            <a class="nav-link dropdown-toggle nav-user-toggle" href="#" id="navUserToggle" role="button" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false"></a>
            <div class="dropdown-menu dropdown-menu-right" aria-labelledby="navUserToggle">
              <a class="dropdown-item" href="#" id="navGestionarCuenta">Mi cuenta</a>
              <a class="dropdown-item" href="#" id="navActividad">Actividad</a>
              <a class="dropdown-item" href="#" id="navAyuda">Ayuda</a>
              <button type="button" class="dropdown-item theme-toggle-item" id="navThemeToggle" aria-label="Cambiar tema">
                <span class="theme-toggle-left">
                  <span class="theme-toggle-icon" aria-hidden="true" id="navThemeIcon">☀</span>
                  <span class="theme-toggle-label">Tema</span>
                </span>
                <span class="theme-switch">
                  <input type="checkbox" id="navThemeSwitch" role="switch" aria-label="Tema oscuro">
                  <span class="theme-switch-track" aria-hidden="true">
                    <span class="theme-switch-thumb" aria-hidden="true"></span>
                  </span>
                </span>
              </button>
              <div class="dropdown-divider"></div>
              <a class="dropdown-item text-danger" href="#" id="navSalir">Salir</a>
            </div>
          </li>
        `);

        $nav.append($dropdown);

        $("#navGestionarCuenta").off("click").on("click", function(e){
            e.preventDefault();
            try { window.location.hash = "#/mi-cuenta"; } catch(ex) {}
            cw.mostrarMiCuenta();
        });
        $("#navActividad").off("click").on("click", function(e){
            e.preventDefault();
            try { window.location.hash = "#/actividad"; } catch(ex) {}
            cw.mostrarActividad();
        });
        $("#navAyuda").off("click").on("click", function(e){
            e.preventDefault();
            try { window.location.href = "/help"; } catch(ex) {}
        });

        // Theme toggle wiring
        (function(){
            const current = cw._applyTheme(cw._getTheme());
            const $switch = $("#navThemeSwitch");
            const $icon = $("#navThemeIcon");
            $switch.prop("checked", current === "dark");
            $icon.text(current === "dark" ? "☾" : "☀");

            const syncUi = (t) => {
                $switch.prop("checked", t === "dark");
                $icon.text(t === "dark" ? "☾" : "☀");
            };

            $("#navThemeToggle").off("click").on("click", function(e){
                // keep dropdown open while toggling
                e.preventDefault();
                e.stopPropagation();
                $switch.prop("checked", !$switch.prop("checked"));
                $switch.trigger("change");
            });

            $switch.off("click").on("click", function(e){
                e.stopPropagation();
            });

            $switch.off("change").on("change", function(){
                const next = cw._applyTheme($switch.prop("checked") ? "dark" : "light");
                syncUi(next);
            });
        })();

        $("#navSalir").off("click").on("click", function(e){
            e.preventDefault();
            cw.salir();
        });

        try {
            const label = ($.cookie && $.cookie("nick")) ? $.cookie("nick") : "Usuario";
            this._setNavUserLabel(label);
        } catch(e) {}
    };

    this._setNavToLogin = function(){
        // Navbar nuevo: dropdown de usuario (restaurar estado "no logueado")
        $("#navUserDropdown").remove();
        try { $("#menuHelp").closest("li").show(); } catch(e) {}
        try { $("#menuIniciarSesion").closest("li").show(); } catch(e) {}
        $("#menuIniciarSesion").off("click").on("click", function(){ cw.mostrarLogin(); });
        return;
        let $salir = $("#btnSalirNav");
        if ($salir.length){
            let $btn = $("<button type='button' class='btn btn-ignition' id='menuIniciarSesion'>Iniciar sesión</button>");
            $salir.replaceWith($btn);
            $btn.on('click', function(){ cw.mostrarLogin(); });
        } else {
            let $nav = $(".navbar-nav.ml-auto");
            if ($nav.length && $nav.find('#menuIniciarSesion').length===0){
                $nav.append("<li class='nav-item'><button type='button' class='btn btn-ignition' id='menuIniciarSesion'>Iniciar sesión</button></li>");
                $("#menuIniciarSesion").on('click', function(){ cw.mostrarLogin(); });
            }
        }
    };

    this._setNavUserLabel = function(text){
        const tNew = String(text || "").trim();
        const $toggle = $("#navUserToggle");
        if ($toggle.length) { $toggle.text(tNew); return; }
        const t = String(text || "").trim();
        const $label = $("#navUserLabel");
        if ($label.length){
            $label.text(t);
        }
    };

    // Mostrar actividad del usuario
    // Estado de visibilidad del panel de actividad
    this._actividadVisible = false;
    this._cuentaVisible = false;
    this._perfil = null;
    this._cargandoCuenta = false;

    this.mostrarActividad = function(){
        // Toggle: si ya está visible, ocultar
        if (this._actividadVisible) {
            $("#au").empty();
            this._actividadVisible = false;
            // Restaurar etiqueta del botón
            const $btn = $("#btnVerActividad, #navActividad");
            if ($btn.length) { $btn.text("Actividad"); }
            this._updateMainVisibility();
            return;
        }
        const email = ($.cookie('email') || (((($.cookie('nick') || '') + '').includes('@')) ? $.cookie('nick') : '') || this.email || '').toLowerCase();
        if (!email){
            this.mostrarAviso('Debes iniciar sesión para ver la actividad', 'error');
            return;
        }
        if (window.rest && typeof rest.obtenerActividad === 'function'){
            rest.obtenerActividad(email);
        }
    };

    // ---------------------------
    // Mi cuenta
    // ---------------------------

    this._setAccountAlert = function(msg, tipo){
        const t = tipo || "info";
        const cls = "alert-" + (t === "error" ? "danger" : t === "success" ? "success" : "info");
        if (!msg){
            $("#account-alert").empty();
            return;
        }
        $("#account-alert").html("<div class='alert " + cls + "' role='alert'>" + msg + "</div>");
    };

    this._renderCuenta = function(user){
        if (!user) return;
        this._perfil = user;

        const name = user.nombre || user.displayName || "";
        const nick = user.nick || "";

        $("#account-nombre").text(name || "—");
        $("#account-nick").text(nick || "—");

        $("#input-nombre").val(name);
        $("#input-nick").val(nick);
        $("#input-password-code").val("");
        $("#input-newPassword").val("");
        $("#input-newPassword2").val("");
        $("#password-change-form").hide();

        const label = (name || nick);
        if (label) this._setNavUserLabel(label);

        const canChangePassword = !!user.canChangePassword;
        if (canChangePassword){
            $("#card-password").show();
            $("#btn-request-password-change").prop("disabled", false);
            $("#password-disabled").hide();
            $("#delete-password-group").show();
            $("#delete-account-hint").text("");
        } else {
            $("#btn-request-password-change").prop("disabled", true);
            $("#password-disabled").show();
            $("#delete-password-group").hide();
            $("#delete-account-hint").text("Cuenta Google: la eliminación solo requiere confirmación.");
        }
    };

    this._cargarCuenta = function(){
        if (this._cargandoCuenta) return;
        this._cargandoCuenta = true;
        this._setAccountAlert("Cargando tu perfil...", "info");

        if (window.rest && typeof rest.obtenerMiCuenta === "function"){
            rest.obtenerMiCuenta(function(user){
                cw._cargandoCuenta = false;
                cw._setAccountAlert("", "info");
                cw._renderCuenta(user);
            }, function(errMsg){
                cw._cargandoCuenta = false;
                cw._setAccountAlert(errMsg || "No se pudo cargar tu cuenta.", "error");
            });
        } else {
            this._cargandoCuenta = false;
            this._setAccountAlert("Servicio de cuenta no disponible.", "error");
        }
    };

    this._wireCuentaHandlers = function(){
        $("#btn-volver-cuenta").off("click").on("click", function(){
            cw._cuentaVisible = false;
            $("#panel-cuenta").hide();
            cw.mostrarSelectorJuegos();
        });

        $("#form-editar-perfil").off("submit").on("submit", function(e){
            e.preventDefault();
            const nombre = ($("#input-nombre").val() || "").trim();
            let nick = ($("#input-nick").val() || "").trim();
            // Normalizar espacios para evitar errores de validación
            nick = nick.replace(/\s+/g, "_");
            $("#input-nick").val(nick);
            const $btn = $("#btn-guardar-perfil");
            $btn.prop("disabled", true).text("Guardando...");
            cw._setAccountAlert("", "info");

            if (window.rest && typeof rest.actualizarMiCuenta === "function"){
                rest.actualizarMiCuenta({ nombre, nick }, function(user){
                    $btn.prop("disabled", false).text("Guardar cambios");
                    cw._setAccountAlert("Perfil actualizado.", "success");
                    try {
                        if (user && user.nick){
                            if (window.jQuery && $.cookie) $.cookie("nick", user.nick);
                        }
                    } catch(e2) {}
                    cw._renderCuenta(user);
                }, function(errMsg){
                    $btn.prop("disabled", false).text("Guardar cambios");
                    cw._setAccountAlert(errMsg || "No se pudo actualizar el perfil.", "error");
                });
            } else {
                $btn.prop("disabled", false).text("Guardar cambios");
                cw._setAccountAlert("Servicio de cuenta no disponible.", "error");
            }
        });

        $("#btn-request-password-change").off("click").on("click", function(){
            const $btn = $("#btn-request-password-change");
            $btn.prop("disabled", true).text("Enviando...");
            cw._setAccountAlert("", "info");

            if (window.rest && typeof rest.solicitarCambioPasswordMiCuenta === "function"){
                rest.solicitarCambioPasswordMiCuenta(function(){
                    $btn.prop("disabled", false).text("Cambiar contraseña");
                    $("#password-change-form").hide();
                    cw._setAccountAlert("Correo enviado. Revisa tu bandeja y abre el enlace para restablecer la contraseña.", "success");
                }, function(errMsg){
                    $btn.prop("disabled", false).text("Cambiar contraseña");
                    cw._setAccountAlert(errMsg || "No se pudo enviar el correo.", "error");
                });
            } else {
                $btn.prop("disabled", false).text("Cambiar contraseña");
                cw._setAccountAlert("Servicio de cuenta no disponible.", "error");
            }
        });

        $("#form-confirm-password-change").off("submit").on("submit", function(e){
            e.preventDefault();
            const code = ($("#input-password-code").val() || "").trim();
            const newPassword = ($("#input-newPassword").val() || "");
            const newPassword2 = ($("#input-newPassword2").val() || "");
            if (!code){
                cw._setAccountAlert("Introduce el código del correo.", "error");
                return;
            }
            if (!newPassword){
                cw._setAccountAlert("Introduce la nueva contraseña.", "error");
                return;
            }
            if (newPassword !== newPassword2){
                cw._setAccountAlert("Las contraseñas no coinciden.", "error");
                return;
            }

            const $btn = $("#btn-confirm-password-change");
            $btn.prop("disabled", true).text("Confirmando...");
            cw._setAccountAlert("", "info");

            if (window.rest && typeof rest.confirmarCambioPasswordMiCuenta === "function"){
                rest.confirmarCambioPasswordMiCuenta({ codeOrToken: code, newPassword: newPassword }, function(){
                    $btn.prop("disabled", false).text("Confirmar cambio");
                    $("#input-password-code").val("");
                    $("#input-newPassword").val("");
                    $("#input-newPassword2").val("");
                    cw._setAccountAlert("Contraseña actualizada.", "success");
                }, function(errMsg){
                    $btn.prop("disabled", false).text("Confirmar cambio");
                    cw._setAccountAlert(errMsg || "No se pudo cambiar la contraseña.", "error");
                });
            } else {
                $btn.prop("disabled", false).text("Confirmar cambio");
                cw._setAccountAlert("Servicio de cuenta no disponible.", "error");
            }
        });

        $("#btn-confirmar-eliminar-cuenta").off("click").on("click", function(){
            const confirmText = ($("#input-confirmDelete").val() || "").trim();
            const password = ($("#input-deletePassword").val() || "");
            const irreversible = $("#check-irrevocable").is(":checked");
            if (confirmText !== "ELIMINAR"){
                cw._setAccountAlert("Escribe ELIMINAR para confirmar.", "error");
                return;
            }
            if (!irreversible){
                cw._setAccountAlert("Debes marcar la casilla de confirmación.", "error");
                return;
            }

            const canChangePassword = !!(cw._perfil && cw._perfil.canChangePassword);
            if (canChangePassword && !password){
                cw._setAccountAlert("Introduce tu contraseña para confirmar.", "error");
                return;
            }
            const payload = canChangePassword ? { password } : { confirm: true };

            const $btn = $("#btn-confirmar-eliminar-cuenta");
            $btn.prop("disabled", true).text("Eliminando...");

            if (window.rest && typeof rest.eliminarMiCuenta === "function"){
                rest.eliminarMiCuenta(payload, function(){
                    $("#modalEliminarCuenta").modal("hide");
                    cw._setAccountAlert("Cuenta eliminada. Cerrando sesión...", "success");
                    try { sessionStorage.removeItem("bienvenidaMostrada"); } catch(e){}
                    setTimeout(function(){ window.location.href = "/"; }, 600);
                }, function(errMsg){
                    $btn.prop("disabled", false).text("Eliminar definitivamente");
                    cw._setAccountAlert(errMsg || "No se pudo eliminar la cuenta.", "error");
                });
            } else {
                $btn.prop("disabled", false).text("Eliminar definitivamente");
                cw._setAccountAlert("Servicio de cuenta no disponible.", "error");
            }
        });
    };

    this.mostrarMiCuenta = function(){
        if (this._cuentaVisible){
            this._cuentaVisible = false;
            $("#panel-cuenta").hide();
            this.mostrarSelectorJuegos();
            return;
        }
        const nick = $.cookie("nick");
        if (!nick){
            this.mostrarAviso("Debes iniciar sesión para acceder a tu cuenta.", "error");
            return;
        }

        $("#selector-juegos").hide();
        $("#panel-partidas").hide();
        $("#zona-juego").hide();
        $("#registro").empty();
        $("#au").empty();
        $("#msg").empty();

        this._actividadVisible = false;
        $("#panel-cuenta").show();
        this._cuentaVisible = true;
        this._updateMainVisibility();

        this._wireCuentaHandlers();
        this._cargarCuenta();
    };

    // Render de la actividad en el panel principal
    this.mostrarActividadListado = function(logs){
        $("#au").empty();
        $("#registro").empty();
        $("#msg").empty();
        let html = "<div class='card'><div class='card-body'>";
        html += "<h5 class='card-title'>Tu actividad reciente</h5>";
        if (!Array.isArray(logs) || logs.length===0){
            html += "<div class='text-muted'>No hay actividad registrada.</div>";
        } else {
            html += "<ul class='list-group'>";
            logs.forEach(function(l){
                const op = l["tipo-operacion"] || l.tipoOperacion || "operación";
                const fh = l["fecha-hora"] || l.fechaHora || "";
                html += "<li class='list-group-item d-flex justify-content-between align-items-center'>" +
                        "<span>" + op + "</span>" +
                        "<small class='text-muted'>" + fh + "</small>" +
                        "</li>";
            });
            html += "</ul>";
        }
        html += "</div></div>";
        $("#au").append(html);
        this._actividadVisible = true;
        // Cambiar etiqueta del botón mientras está visible
        const $btn = $("#btnVerActividad, #navActividad");
        if ($btn.length) { $btn.text("Cerrar actividad"); }
        this._updateMainVisibility();
    };

    this.mostrarRegistro = function(){
        $("#fmRegistro").remove();
        $("#msg").empty();
        $("#registro").load("./registro.html", function(){
            $("#btnRegistro").on("click", function(e){
                e.preventDefault();
                let email = $("#email").val().trim();
                let pwd   = $("#pwd").val().trim();
                let nick = $("#nick").val().trim();
                // No loggear emails.
                
                // Validación individual de campos
                if (!email) {
                    cw.mostrarModal("Debes introducir un email válido.");
                    return;
                }
                
                if (!nick) {
                    cw.mostrarModal("Debes introducir un nick.");
                    return;
                }
                
                if (nick.length < 3) {
                    cw.mostrarModal("El nick debe tener al menos 3 caracteres.");
                    return;
                }
                
                if (!pwd) {
                    cw.mostrarModal("Debes introducir una contraseña.");
                    return;
                }

                // Validación de contraseña: mínimo 8 caracteres, al menos una mayúscula, una minúscula y un número o símbolo
                const pwdValida = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9\W_]).{8,}$/;
                if (!pwdValida.test(pwd)) {
                    cw.mostrarModal("La contraseña debe tener:\n• Mínimo 8 caracteres\n• Al menos una mayúscula\n• Al menos una minúscula\n• Al menos un número o símbolo");
                    return;
                }

                rest.registrarUsuario(email, pwd, nick);
            });

            // ensure main content visible after loading
            cw._updateMainVisibility();

        });
    };
    this.mostrarLogin = function(options){
        let opts = options || {};
        $("#fmLogin").remove();
        if (!opts.keepMessage){
            $("#msg").empty();
        }
        $("#registro").load("./login.html", function(){
            if (opts.email){
                $("#emailLogin").val(opts.email);
            }

            if (opts.message){
                cw.mostrarAviso(opts.message, opts.messageType || "info");
                try {
                    // limpiar query para que no se repita al recargar
                    if (window.history && window.history.replaceState){
                        const clean = window.location.pathname + window.location.hash;
                        window.history.replaceState({}, document.title, clean);
                    }
                } catch(e) {}
            }

            $("#btnLogin").on("click", function(e){
            e.preventDefault();
            let email = $("#emailLogin").val();
            let pwd   = $("#pwdLogin").val();
            if (email && pwd){
                rest.loginUsuario(email, pwd);
            }
            });

            $("#link-forgot-password").off("click").on("click", function(e){
                e.preventDefault();
                const email = ($("#emailLogin").val() || "").trim();
                const qs = email ? ("?email=" + encodeURIComponent(email)) : "";
                window.location.href = "/forgot-password" + qs;
            });

            $("#form-forgot-password").off("submit").on("submit", function(e){
                e.preventDefault();
                const email = ($("#forgot-email").val() || "").trim();
                if (!email){
                    $("#forgot-password-alert").text("Introduce un email válido.").show();
                    return;
                }

                const $btn = $("#btn-forgot-send");
                $btn.prop("disabled", true).text("Enviando...");
                $("#forgot-password-alert").hide().text("");

                const base = (window.APP_CONFIG && window.APP_CONFIG.SERVER_URL) ? String(window.APP_CONFIG.SERVER_URL) : "";
                let url = "/api/auth/password-reset/request";
                if (base) {
                    try { url = new URL("/api/auth/password-reset/request", base).toString(); } catch(e2) {}
                }

                fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ email })
                }).then(function(){
                    $("#modalForgotPassword").modal("hide");
                    cw.mostrarAviso("Si el correo existe, te hemos enviado instrucciones.", "success");
                }).catch(function(){
                    $("#modalForgotPassword").modal("hide");
                    cw.mostrarAviso("Si el correo existe, te hemos enviado instrucciones.", "success");
                }).finally(function(){
                    $btn.prop("disabled", false).text("Enviar");
                });
            });

            // ensure navbar shows the login control when login form is visible
            cw._setNavToLogin();
            // ensure main content visible after loading
            cw._updateMainVisibility();
        });
    };

    this.mostrarModal = function (m) {
        console.log("[Modal] mensaje recibido:", m);
        if (!$('#miModal').length) {
            console.error('[Modal] No se encuentra el modal #miModal en el DOM');
            return;
        }
        // 1. vaciar el cuerpo del modal
        $('#mBody').empty();

        // 2. meter el texto
        $('#mBody').text(m || "");

        // 3. mostrar el modal
        console.log('[Modal] Mostrando modal #miModal');
        $('#miModal').modal('show');
    };

    // Mostrar la zona de partidas (cuando el usuario ya está logueado)
    this.mostrarPartidas = function(){
        if (!this.juegoActual){
            this.juegoActual = 'uno';
        }
        // ocultar cosas de login/registro/mensajes
        $("#registro").empty();
        $("#au").empty();
        $("#msg").empty();

        // mostrar el panel de partidas
        $("#panel-partidas").show();

        if (window.ws && ws.pedirListaPartidas){
            ws.pedirListaPartidas();
        }
        // si ya teníamos una lista recibida antes de mostrar el panel, pintarla
        if (window._ultimaListaPartidas){
            cw.pintarPartidas(window._ultimaListaPartidas);
        }

        cw._updateMainVisibility();  // actualiza visibilidad de mainContent
    };

    // Pintar la tabla de partidas disponibles (abiertas)
    // lista: [{ codigo, propietario }]
        // Pintar la tabla de partidas disponibles (abiertas)
    // lista: [{ codigo, propietario, jugadores, maxJug, juego, ... }]
    this.pintarPartidas = function(lista){
                // Deshabilitar botón crear partida si ya tiene una propia
                if (this.tienePartidaPropia(lista)) {
                    $("#btn-crear-partida").prop("disabled", true).attr("title", "Elimina tu partida antes de crear otra");
                } else {
                    $("#btn-crear-partida").prop("disabled", false).removeAttr("title");
                }
        try { window._ultimaListaPartidas = lista; } catch(e){}

        const juegoActual = cw.juegoActual;


        const $tbody = $("#tbody-partidas");
        $tbody.empty();

        // Si no hay ninguna partida
        if (!Array.isArray(lista) || lista.length === 0){
            $tbody.append(`
              <tr><td colspan="2" class="text-muted">No hay partidas en el sistema.</td></tr>
            `);
            return;
        }

        // Filtrar por juego actual (si lo hay)
        const listaFiltrada = lista.filter(function(p){
            if (!juegoActual) return true;
            if (!p.juego) return (juegoActual === 'uno');
            return p.juego === juegoActual;
        });

        if (listaFiltrada.length === 0){
            $tbody.append(`
              <tr><td colspan="2" class="text-muted">No hay partidas para este juego.</td></tr>
            `);
            return;
        }

        const norm = (v) => String(v || "").trim().toLowerCase();
        const myNick = norm($.cookie && $.cookie("nick"));
        const myUserId = norm($.cookie && $.cookie("uid"));

        // Usar tarjetas visuales en vez de filas de tabla
        listaFiltrada.forEach(function(p){
            const players = Array.isArray(p.players) ? p.players : [];
            const jugadores = players.length > 0
                ? players.length
                : (Array.isArray(p.jugadores)
                    ? p.jugadores.length
                    : (typeof p.jugadores === 'number'
                        ? p.jugadores
                        : (p.numJugadores || 0)));
            const maxPlayers = (typeof p.maxPlayers === 'number')
                ? p.maxPlayers
                : ((typeof p.maxJug === 'number') ? p.maxJug : 2);
            const statusRaw =
                (typeof p.matchStatus === 'string' && String(p.matchStatus).trim())
                    ? String(p.matchStatus).trim()
                    : (typeof p.status === 'string' && String(p.status).trim())
                        ? String(p.status).trim()
                        : (jugadores >= maxPlayers ? 'FULL' : 'OPEN');
            const status = statusRaw;
            const statusNorm = norm(statusRaw);
            const started =
                !!p.started ||
                statusNorm === 'started' ||
                statusNorm === 'in_progress';
            const isFull = jugadores === maxPlayers;
            const joined = !!myUserId && players.some(pl => norm(pl && pl.userId) === myUserId);
            const isHost =
                (!!myUserId && norm(p && p.hostUserId) === myUserId) ||
                (!myUserId && !!myNick && norm(p && p.propietario) === myNick);
            const juego = p.juego || juegoActual || 'uno';
            const nombreJuego =
                juego === 'uno'    ? 'Última carta' :
                juego === '4raya'  ? '4 en raya' :
                (juego === 'damas' || juego === 'checkers') ? 'Damas' :
                juego === 'hundir' ? 'Hundir la flota' :
                juego;
            const statusClass =
                statusNorm === 'started' || statusNorm === 'in_progress' ? 'status-active' :
                statusNorm === 'open' || statusNorm === 'full' || statusNorm === 'waiting' || statusNorm === 'waiting_start' ? 'status-pending' :
                'status-finished';
            let acciones = '';
            if (isHost){
                const startLabel = "Jugar";
                const startDisabled = started || !isFull;
                const startTitle = startDisabled ? "La sala debe estar completa para jugar" : "";
                acciones += `
                  <button class="btn btn-jugar btn-continuar" data-codigo="${p.codigo}" ${startDisabled ? 'disabled' : ''} ${startTitle ? 'title="' + startTitle + '"' : ''}>${startLabel}</button>
                  <button class="btn btn-eliminar btn-eliminar" data-codigo="${p.codigo}">Eliminar</button>
                `;
            } else if (joined) {
                const waitStartHint = statusNorm === 'waiting_start'
                    ? '<span class="text-muted small mr-2">Esperando a que el creador inicie...</span>'
                    : '';
                acciones += `
                  ${waitStartHint}
                  <span class="badge badge-pill badge-joined mr-2">Unido</span>
                  <button class="btn btn-outline-secondary btn-abandonar" data-codigo="${p.codigo}">Abandonar</button>
                `;
            } else {
                const joinDisabled = started || isFull;
                acciones += `
                  <button class="btn btn-primary btn-unirse" data-codigo="${p.codigo}" ${joinDisabled ? 'disabled' : ''}>Unirse</button>
                `;
            }
            let propietarioTexto = p.propietario || 'Anfitrión';
            if (propietarioTexto.includes('@')) propietarioTexto = 'Anfitrión';
            const card = `
              <tr><td colspan="2" style="padding:0; border:none; background:transparent;">
                <div class="partida-card-row">
                  <div class="partida-info">
                    <div>
                      <span class="partida-codigo">${p.codigo}</span>
                      <button class="btn btn-light btn-sm ml-1 btn-copiar-codigo" data-codigo="${p.codigo}" title="Copiar código">Copiar</button>
                    </div>
                    <small class="text-muted">
                      ${nombreJuego ? nombreJuego + ' · ' : ''}${propietarioTexto} · ${jugadores}/${maxPlayers} · <span class="badge-status ${statusClass}">${status}</span>
                    </small>
                  </div>
                  <div class="partida-acciones">${acciones}</div>
                </div>
              </td></tr>
            `;
            $tbody.append(card);
        });

    };
}
