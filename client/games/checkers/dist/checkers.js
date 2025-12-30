function CheckersGame() {
  function $(id) {
    return document.getElementById(id);
  }

  function normalizeId(value) {
    return String(value || "")
      .trim()
      .toLowerCase();
  }

  function getCookieValue(cookieStr, name) {
    const parts = String(cookieStr || "")
      .split(";")
      .map((p) => p.trim())
      .filter(Boolean);
    for (const part of parts) {
      const idx = part.indexOf("=");
      if (idx === -1) continue;
      const k = part.slice(0, idx);
      const v = part.slice(idx + 1);
      if (k === name) return decodeURIComponent(v);
    }
    return null;
  }

  function resolveNickOrEmail() {
    const localCookie = typeof document !== "undefined" ? document.cookie : "";
    const direct =
      getCookieValue(localCookie, "nick") || getCookieValue(localCookie, "email");
    if (direct) return direct;

    try {
      const parentCookie = window.parent?.document?.cookie || "";
      return (
        getCookieValue(parentCookie, "nick") ||
        getCookieValue(parentCookie, "email") ||
        null
      );
    } catch {
      return null;
    }
  }

  const params = new URLSearchParams(window.location.search);
  const codigo = params.get("codigo");
  const email = resolveNickOrEmail();
  const myId = normalizeId(email);

  const elBoard = $("board");
  const elSubtitle = $("subtitle");
  const elNotice = $("notice");
  const elError = $("error");
  const elTurn = $("turn");
  const elCountWhite = $("count-white");
  const elCountBlack = $("count-black");
  const elWinnerRow = $("winner-row");
  const elWinner = $("winner");
  const elPillCode = $("pill-code");
  const elPillColor = $("pill-color");

  if (elPillCode) elPillCode.textContent = codigo ? `Partida: ${codigo}` : "";

  const cellEls = [];
  let socket = null;
  let current = null;
  let selectedFrom = null;
  let myColor = null;

  function setError(text) {
    if (!elError) return;
    if (!text) {
      elError.style.display = "none";
      elError.textContent = "";
      return;
    }
    elError.style.display = "";
    elError.textContent = text;
  }

  function setNotice(text) {
    if (!elNotice) return;
    if (!text) {
      elNotice.style.display = "none";
      elNotice.textContent = "";
      return;
    }
    elNotice.style.display = "";
    elNotice.textContent = text;
  }

  function isMyTurn() {
    return (
      current &&
      current.status === "playing" &&
      myColor &&
      current.currentPlayer === myColor
    );
  }

  function buildBoardOnce() {
    if (!elBoard) return;
    elBoard.innerHTML = "";
    for (let r = 0; r < 8; r++) {
      cellEls[r] = [];
      for (let c = 0; c < 8; c++) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "cell " + (((r + c) % 2 === 0) ? "cell--light" : "cell--dark");
        btn.setAttribute("role", "gridcell");
        btn.dataset.r = String(r);
        btn.dataset.c = String(c);
        btn.addEventListener("click", onCellClick);
        elBoard.appendChild(btn);
        cellEls[r][c] = btn;
      }
    }
  }

  function pieceOwner(piece) {
    if (piece > 0) return "white";
    if (piece < 0) return "black";
    return null;
  }

  function isKing(piece) {
    return Math.abs(piece) === 2;
  }

  function getMovesForFrom(from) {
    const moves = (current && current.legalMoves) || [];
    return moves.filter((m) => m && m.from && m.to && m.from.r === from.r && m.from.c === from.c);
  }

  function posEq(a, b) {
    return !!a && !!b && a.r === b.r && a.c === b.c;
  }

  function render() {
    if (!current) return;

    const players = current.players || [];
    myColor = null;
    for (const p of players) {
      if (!p || normalizeId(p.id) !== myId) continue;
      myColor = p.color;
      break;
    }

    if (elPillColor) {
      elPillColor.textContent = myColor
        ? `Tú: ${myColor === "white" ? "blancas" : "negras"}`
        : "Tú: —";
    }

    if (elTurn) {
      elTurn.textContent =
        current.currentPlayer === "white" ? "Blancas" : "Negras";
    }

    if (elCountWhite) elCountWhite.textContent = String(current.pieceCounts?.white ?? "—");
    if (elCountBlack) elCountBlack.textContent = String(current.pieceCounts?.black ?? "—");

    if (current.status === "finished") {
      if (elWinnerRow) elWinnerRow.style.display = "";
      if (elWinner) elWinner.textContent = current.winner === "white" ? "Blancas" : "Negras";
      if (elSubtitle) elSubtitle.textContent = "Partida finalizada.";
    } else {
      if (elWinnerRow) elWinnerRow.style.display = "none";
      if (elWinner) elWinner.textContent = "";

      if (!myColor) {
        if (elSubtitle) elSubtitle.textContent = "Conectado. Esperando asignación de jugador...";
      } else if (isMyTurn()) {
        if (elSubtitle) elSubtitle.textContent = "Tu turno.";
      } else {
        if (elSubtitle) elSubtitle.textContent = "Turno del rival.";
      }
    }

    const forced = current.forcedFrom;
    if (forced && isMyTurn()) {
      setNotice("Debes seguir capturando con esta pieza.");
    } else {
      setNotice("");
    }

    if (isMyTurn() && forced && (!selectedFrom || !posEq(selectedFrom, forced))) {
      selectedFrom = { r: forced.r, c: forced.c };
    }

    if (selectedFrom) {
      const allowed = getMovesForFrom(selectedFrom);
      if (allowed.length === 0) selectedFrom = null;
    }

    const board = current.board || [];
    const dests = new Set();
    if (selectedFrom) {
      for (const m of getMovesForFrom(selectedFrom)) {
        dests.add(`${m.to.r},${m.to.c}`);
      }
    }

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const btn = cellEls?.[r]?.[c];
        if (!btn) continue;

        btn.classList.toggle("cell--selected", !!selectedFrom && selectedFrom.r === r && selectedFrom.c === c);
        btn.classList.toggle("cell--forced", !!forced && forced.r === r && forced.c === c);
        btn.classList.toggle("cell--dest", dests.has(`${r},${c}`));

        btn.disabled = !isMyTurn() && current.status !== "finished";

        btn.innerHTML = "";
        const piece = (board[r] && board[r][c]) || 0;
        if (piece === 0) continue;

        const owner = pieceOwner(piece);
        const pieceEl = document.createElement("div");
        pieceEl.className = "piece " + (owner === "white" ? "piece--white" : "piece--black");
        if (isKing(piece)) {
          const k = document.createElement("div");
          k.className = "king";
          k.textContent = "K";
          pieceEl.appendChild(k);
        }
        btn.appendChild(pieceEl);
      }
    }
  }

  function onCellClick(e) {
    e?.preventDefault?.();
    setError("");
    if (!current || current.status !== "playing") return;
    if (!isMyTurn()) return;

    const btn = e.currentTarget;
    const r = Number.parseInt(btn.dataset.r, 10);
    const c = Number.parseInt(btn.dataset.c, 10);
    if (!Number.isFinite(r) || !Number.isFinite(c)) return;

    const forced = current.forcedFrom;
    if (forced && (forced.r !== r || forced.c !== c) && (!selectedFrom || !posEq(selectedFrom, forced))) {
      selectedFrom = { r: forced.r, c: forced.c };
    }

    const board = current.board || [];
    const piece = (board[r] && board[r][c]) || 0;
    const owner = pieceOwner(piece);

    if (selectedFrom) {
      const destinations = getMovesForFrom(selectedFrom);
      const chosen = destinations.find((m) => m.to.r === r && m.to.c === c);
      if (chosen) {
        if (socket) {
          socket.emit("checkers_move", {
            codigo,
            email,
            from: { r: selectedFrom.r, c: selectedFrom.c },
            to: { r, c },
          });
        }
        return;
      }
    }

    if (!owner || owner !== myColor) {
      selectedFrom = null;
      render();
      return;
    }

    const nextFrom = { r, c };
    if (forced && !posEq(forced, nextFrom)) {
      selectedFrom = { r: forced.r, c: forced.c };
      render();
      return;
    }

    const possible = getMovesForFrom(nextFrom);
    selectedFrom = possible.length > 0 ? nextFrom : null;
    render();
  }

  function init() {
    buildBoardOnce();
    if (!codigo) {
      setError("Falta el código de partida en la URL.");
      if (elSubtitle) elSubtitle.textContent = "Error.";
      return;
    }
    if (!email) {
      setError("No se pudo leer tu nick/email (cookie). Vuelve a la app e inicia sesión.");
      if (elSubtitle) elSubtitle.textContent = "Error.";
      return;
    }
    if (typeof window.io !== "function") {
      setError("Socket.IO no está disponible.");
      if (elSubtitle) elSubtitle.textContent = "Error.";
      return;
    }

    socket = window.io(window.location.origin, {
      path: "/socket.io",
      withCredentials: true,
    });

    socket.on("connect", function () {
      setError("");
      if (elSubtitle) elSubtitle.textContent = "Conectado. Esperando estado...";
      socket.emit("checkers_join", { codigo, email });
    });

    socket.on("checkers_state", function (payload) {
      if (!payload || payload.codigo !== codigo) return;
      const st = payload.state || null;
      if (!st) return;
      current = {
        ...st,
        players: payload.players || [],
        legalMoves: st.legalMoves || [],
      };
      render();
    });

    socket.on("checkers_error", function (payload) {
      if (!payload || payload.codigo !== codigo) return;
      setError(payload.message || "Movimiento inválido.");
      render();
    });

    socket.on("connect_error", function () {
      setError("Error de conexión con el servidor.");
      if (elSubtitle) elSubtitle.textContent = "Error.";
    });
  }

  init();
}

CheckersGame();
