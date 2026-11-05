# DuasBolasVR (Duas Bolas)

Ping pong em VR para o Meta Quest 3, no navegador do óculos (WebXR), com uma raquete em cada mão
e duas bolas em jogo ao mesmo tempo (azul e laranja), cada uma com o seu ponto. Torneio em escada
contra 5 adversários que também jogam com duas raquetes; os dois últimos põem uma terceira bola
(verde) em jogo. Cenário: ginásio de escola à noite. Também joga no PC com o mouse. Tudo em
português. Feito a partir do `PingPongVR`.

## Como rodar / jogar

**No PC:** `python serve.py` nesta pasta e abrir `http://localhost:8854` (o painel de
visualização usa isso pelo `.claude/launch.json`). Use o `serve.py` (manda o navegador não guardar
cache), não o `python -m http.server`.

**No Quest (quando for publicado):** https://parappathe.github.io/DuasBolasVR/ e "Entrar em VR".
Para publicar: commitar e rodar `python publicar.py DuasBolasVR` em `C:\claude code` (só quando o
Eduardo pedir). Ainda **não publicado**.

**No Quest pela rede de casa (alternativa):** dois cliques em `jogar-no-quest.bat` (ou
`python serve.py --https`), abrir no Quest o endereço `https://192.168.x.x:8443` que a janela
mostra, aceitar o aviso de certificado e "Entrar em VR". Nos outros jogos esse caminho não
funcionou no Quest do Eduardo.

### Controles

| | VR (Quest) | PC |
|---|---|---|
| Raquetes | Uma em cada controle; as duas rebatem. Velocidade e ângulo da batida definem força, direção e efeito | As duas seguem o mouse, lado a lado (cada uma pega a bola que passa perto dela) |
| Saque | Não tem: as bolas saem sozinhas das máquinas lançadoras | Igual |
| Cortada | Bater forte | Segurar o botão do mouse na hora da batida |
| Mira | A raquete | Lado da raquete que acerta a bola |
| Pausa | B ou Y | Esc ou P |
| Menu | Apontar com o controle e gatilho | Clique |
| FPS | Opções → Mostrar FPS | Tecla F |

No menu de pausa do VR tem "Recentralizar"; também é feito sozinho ao entrar no VR.

### Regras

- Duas bolas em jogo ao mesmo tempo, cada uma com o seu ponto independente (regras normais do
  ping pong para cada bola: quicar do outro lado, não deixar quicar duas vezes, voleio etc.). As
  bolas não batem uma na outra.
- Placar único: cada bola perdida dá um ponto a quem ganhou aquele ponto. Partida até 11 com 2 de
  vantagem (ou melhor de 3, nas Opções).
- Saque automático: quando uma bola sai de jogo, ela some por 1,2 s, aparece piscando na máquina
  lançadora (a luz da máquina acende na cor dela) e sai 0,7 s depois. **Quem perdeu o ponto
  daquela bola relança**, pela máquina do seu lado. Bola que toca a rede no lançamento e cai certa:
  repete.
- Máquinas: a sua fica à esquerda da mesa, a do adversário à direita dele, longe das raquetes.
  O lançamento é moderado (5 m/s) e sempre cai na mesa.
- Começo da partida: a azul sai da máquina do adversário e a laranja da sua, um pouco depois.
- Terceira bola (verde): com o Professor Malabar e a Dona Tempestade, entra quando alguém chega a
  8 pontos, lançada por quem está atrás (empate: a máquina do adversário). Entra uma vez só.
- Torneio: vencer o adversário libera o próximo. Progresso e opções no localStorage, chave
  `duasbolasvr.v1`.

Adversários (`OPPONENTS` em `js/ai.js`):

1. **Lia Calma** (iniciante): devagar e sem efeito.
2. **Seu Polvo** (braços longos): alcança quase tudo, devolve alto e devagar, cortando.
3. **Rô Relâmpago** (atacante): pega a bola subindo e devolve rápido.
4. **Professor Malabar** (três bolas): muito efeito; põe a verde no 8.
5. **Dona Tempestade** (campeã): rápida e precisa; também põe a verde no 8.

A IA tem uma IA por mão (`TwoHands`): cada bola que vem vai para a mão livre que chega com mais
folga; com as duas ocupadas, a bola espera uma ficar livre. Cada mão anda com velocidade limitada
(`move`), sem teleporte.

## Como testar

- `node tests/run.js` (ou `npm test`): física, regras, duas raquetes pegando duas bolas ao mesmo
  tempo, rallies independentes (ponto de uma bola não mexe na outra), relançamento pelo lado de
  quem perdeu, terceira bola no 8 (só nos adversários 4 e 5, uma vez só), duas mãos cuidando de
  bolas diferentes sem passar da velocidade, e partidas IA x IA (terminam em 11, a Dona Tempestade
  ganha da Lia Calma). Tem que terminar com "Tudo certo". Não toca som.
- No navegador: abrir `http://localhost:8854/?mudo` (o `?mudo` nunca liga o som) e, no console,
  `dbvr.startMatch(3); dbvr.dev.autoplay = true; dbvr.dev.advance(60); dbvr.dev.state()`.
  `advance` roda segundos de jogo na hora (o painel escondido não anima). O autoplay põe a raquete
  mais perto na bola que chega primeiro; ganha quase sempre, então não mede dificuldade.
- **Só no óculos:** as duas raquetes nas mãos (ângulo), sensação das batidas, dar conta de duas
  bolas, vibração, conforto, desempenho (meta 72 FPS).

## Estrutura

| Arquivo | O que tem |
|---|---|
| `index.html`, `css/style.css` | Página, botão "Entrar em VR", dica e FPS do modo PC |
| `js/physics.js` | Física da bola e colisão contínua com a raquete (igual ao PingPongVR). Sem navegador |
| `js/match.js` | Regras de um ponto (`Rally`) e placar (`Match`). Sem navegador |
| `js/ai.js` | Os 5 adversários, a IA de uma mão (`AIPlayer`) e a de duas mãos (`TwoHands`). Sem navegador |
| `js/game.js` | `MultiCore`: várias bolas com rallies independentes, máquinas lançadoras, terceira bola, em passos de 1/240 s. Sem navegador |
| `js/main.js` | Renderização, duas raquetes (VR e mouse), menus, placar, sons, `window.dbvr` |
| `js/scene.js` | Ginásio, mesa grafite, máquinas, placar pendurado, torcida, bolas, adversário com dois braços |
| `js/ui.js` | Painel de menu 3D (canvas) |
| `js/audio.js` | Sons sintetizados e a musiquinha |
| `js/tournament.js` | Progresso e opções salvos |
| `serve.py`, `jogar-no-quest.bat` | Servidor local sem cache; `--https` para o Quest na rede |
| `tests/run.js` | Testes automáticos |
| `vendor/three/three.module.js` | Three.js r170 (cópia local) |

Coordenadas: metros, mesa centrada na origem, jogador no lado +Z, adversário no -Z, rede em z = 0,
tampo a 0,76 m.

## Regras e convenções do projeto

- `physics.js`, `match.js`, `ai.js` e `game.js` não usam navegador nem Three.js (os testes rodam
  no Node). Mexeu neles: `node tests/run.js`.
- Ajustar um adversário: valores em `OPPONENTS` (`js/ai.js`), como no PingPongVR; `move` vale
  para cada mão; `third` liga a bola verde.
- Tempos e velocidade do lançamento: `PAUSE_AFTER`, `SHOW_BEFORE`, `LAUNCH_SPEED`, `THIRD_AT` no
  topo de `js/game.js`.
- Testes e navegador de teste sem som (`?mudo`).

## Decisões

- Sem saque manual: com duas bolas, segurar uma bola para sacar travaria a outra mão. Máquinas
  lançadoras automáticas, e quem perdeu o ponto daquela bola relança (dá a iniciativa a quem está
  perdendo aquela bola, e é fácil de entender).
- Máquinas ao lado da mesa, e não no fundo: no fundo ficariam no caminho das raquetes.
- O jogador nunca rebate a bola que ele mesmo acabou de mandar (não existe "dois toques" para ele):
  com duas raquetes isso aconteceria sem querer.
- Velocidades das IAs menores que no PingPongVR (lançamento a 5 m/s): com duas bolas já é difícil.
- Mesa grafite: azul, laranja e verde aparecem bem nela (numa mesa verde ou azul, uma das bolas
  sumiria).
- No PC, cada raquete pega a bola num raio de 20 cm (as duas juntas cobrem uns 80 cm sem buraco no
  meio): o mouse não tem como mexer as duas separadas.
- Bolas desenhadas 10% maiores que a física, para enxergar a cor.

## Pendências / problemas conhecidos

- Nada testado no Quest ainda: as duas raquetes nas mãos, força das batidas, se dá para
  acompanhar duas (ou três) bolas, vibração, FPS.
- Dificuldade contra pessoa não medida (o autoplay quase não erra). Pode precisar de bolas mais
  lentas ou ajuda na mira mais alta como padrão.
- Não publicado no GitHub Pages; quando for, acrescentar o cartão no `SiteJogos`.
