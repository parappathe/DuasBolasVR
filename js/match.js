// Regras: ponto a ponto (Rally) e placar da partida (Match). Lados: 0 = jogador, 1 = adversário.
// Não depende de navegador.

// Saque simplificado: a bola sacada pode ir direto para o lado do adversário (não precisa
// quicar antes no lado de quem saca). Bola que toca a rede no saque e cai certa: repete (let).
export class Rally {
  constructor(server) {
    this.server = server;
    this.lastHitter = null;
    this.bounces = 0;        // quiques desde a última batida
    this.isServe = true;
    this.netOnServe = false;
    this.time = 0;
    this.result = null;      // {winner, reason} ou {let: true}
  }

  _end(winner, reason) {
    if (!this.result) this.result = { winner, reason };
    return this.result;
  }

  // wouldBeOut: a bola, sem ser tocada, cairia fora da mesa (só importa em voleio).
  onHit(who, wouldBeOut = false) {
    if (this.result) return this.result;
    this.time = 0;
    if (this.lastHitter === null) {
      if (who !== this.server) return this._end(1 - who, 'saque fora de hora');
      this.lastHitter = who;
      return null;
    }
    if (who === this.lastHitter) return this._end(1 - who, 'dois toques');
    if (this.bounces === 0) {
      // Voleio: pegou a bola antes de ela quicar no seu lado.
      return wouldBeOut ? this._end(who, 'bola fora') : this._end(1 - who, 'pegou antes de quicar');
    }
    this.lastHitter = who;
    this.bounces = 0;
    this.isServe = false;
    return null;
  }

  onNet() {
    if (this.isServe && this.lastHitter !== null && this.bounces === 0) this.netOnServe = true;
  }

  onTable(side) {
    if (this.result || this.lastHitter === null) return this.result;
    this.time = 0;
    if (this.bounces === 0) {
      if (side === this.lastHitter) return this._end(1 - this.lastHitter, 'quicou no próprio lado');
      if (this.isServe && this.netOnServe) { this.result = { let: true }; return this.result; }
      this.bounces = 1;
      return null;
    }
    // Segundo quique: o adversário não devolveu.
    return this._end(this.lastHitter, 'não devolveu');
  }

  onFloor() {
    if (this.result || this.lastHitter === null) return this.result;
    if (this.bounces === 0) return this._end(1 - this.lastHitter, 'bola fora');
    return this._end(this.lastHitter, 'não devolveu');
  }

  tick(dt) {
    if (this.result || this.lastHitter === null) return this.result;
    this.time += dt;
    if (this.time > 8) return this.bounces === 0 ? this._end(1 - this.lastHitter, 'bola parada') : this._end(this.lastHitter, 'bola parada');
    return null;
  }
}

export class Match {
  constructor({ pointsToWin = 11, bestOf = 1, firstServer = 0 } = {}) {
    this.pointsToWin = pointsToWin;
    this.bestOf = bestOf;
    this.firstServer = firstServer;
    this.score = [0, 0];
    this.games = [0, 0];
    this.gameIndex = 0;
    this.over = false;
    this.winner = null;
  }

  // Saque troca a cada 2 pontos; no empate em 10 x 10 (deuce), a cada ponto.
  // Em cada game novo, começa sacando quem recebeu no game anterior.
  get server() {
    const first = (this.firstServer + this.gameIndex) % 2;
    const [a, b] = this.score;
    const deuce = this.pointsToWin - 1;
    const total = a + b;
    const turns = (a >= deuce && b >= deuce) ? deuce + (total - 2 * deuce) : Math.floor(total / 2);
    return (first + turns) % 2;
  }

  addPoint(winner) {
    if (this.over) return { gameWon: false, matchWon: false };
    this.score[winner]++;
    const s = this.score[winner], o = this.score[1 - winner];
    if (s >= this.pointsToWin && s - o >= 2) {
      this.games[winner]++;
      if (this.games[winner] > this.bestOf / 2) {
        this.over = true;
        this.winner = winner;
        return { gameWon: true, matchWon: true };
      }
      this.lastGameScore = [...this.score];
      this.score = [0, 0];
      this.gameIndex++;
      return { gameWon: true, matchWon: false };
    }
    return { gameWon: false, matchWon: false };
  }

  // Ponto de game/partida para alguém?
  gamePointFor() {
    for (const w of [0, 1]) {
      const s = this.score[w], o = this.score[1 - w];
      if (s + 1 >= this.pointsToWin && s + 1 - o >= 2) return w;
    }
    return null;
  }
}
