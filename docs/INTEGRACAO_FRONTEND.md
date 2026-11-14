# Guia de integração Front ↔ Contrato

Tudo o que o frontend precisa saber sobre o contrato `AluguelEquipamentos`. O ABI está em `frontend/contrato.js` (variáveis `ABI`, `ENDERECO_CONTRATO`, `CHAIN_ID_SEPOLIA`). Depois do deploy, o back-end passa o endereço e troca o placeholder.

## 1. Conexão

- Rede: **Sepolia**, chainId `11155111` (hex `0xaa36a7`). Se `chainId` for outro, chamar `wallet_switchEthereumChain` e mostrar aviso.
- Escutar `accountsChanged` e `chainChanged` (recarregar a tela ao mudar).
- Usar **web3.js v4** (`web3@4.x`, versão fixa) ou ethers v6. Os exemplos abaixo usam web3 v4.

```js
const web3 = new Web3(window.ethereum);
const contrato = new web3.eth.Contract(ABI, ENDERECO_CONTRATO);
const [conta] = await window.ethereum.request({ method: "eth_requestAccounts" });

// leitura (call)
const total = await contrato.methods.totalEquipamentos().call();
// escrita (send) — abre a MetaMask
await contrato.methods.devolver(id).send({ from: conta });
```

## 2. Armadilhas importantes (já validadas nos testes)

| Assunto | Regra |
|---|---|
| **BigInt** | web3 v4 devolve todo `uint`/`int` como **BigInt**. Não use `JSON.stringify` direto (dá erro) e converta com `Number(x)` (ids, status, dias) ou `x.toString()` (wei). |
| **Wei ↔ ETH** | `web3.utils.fromWei(x, "ether")` para mostrar; `web3.utils.toWei("0.001", "ether")` para enviar. |
| **Valor exato em `alugar`** | Enviar **exatamente** `custoTotal(id, dias)`; qualquer diferença reverte com `ValorIncorreto`. Sempre ler `custoTotal` do contrato, sem calcular no front. |
| **Categoria (`bytes32`)** | Converter texto → bytes32: `web3.utils.padRight(web3.utils.utf8ToHex("CAMERA"), 64)`. Para ler: `web3.utils.hexToUtf8(hex).replace(/\0/g, "")`. Sem filtro = `"0x" + "0".repeat(64)`. |
| **Struct retornada** | `obterEquipamento` e `obterAluguel` retornam objeto com campos nomeados (`.nome`, `.precoPorDia`, `.status`...). |
| **Tempo** | Datas vêm em segundos: `new Date(Number(a.fim) * 1000)`. Um "dia" do contrato dura `DURACAO_DIA` segundos (ler `await contrato.methods.DURACAO_DIA().call()`); em demonstrações pode ser bem menor que 86400. **Nunca assuma 86400 no front.** |
| **Reputação** | `reputacao(addr)` é **inteiro com sinal** e pode ser negativa. |

## 3. Enums

| `StatusEquipamento` | `StatusAluguel` |
|---|---|
| 0 Disponivel · 1 Alugado · 2 Inativo | 0 Ativo · 1 Devolvido · 2 Concluido · 3 EmDisputa · 4 Resolvido |

## 4. Tela × função

| Tela / ação | Função | Tipo | Quem pode |
|---|---|---|---|
| Catálogo (com filtro e paginação) | `listarEquipamentos(categoria, apenasDisponiveis, inicio, limite)` → `{resultado[], proximo}` | call | todos (`limite` 1..50; continuar de `proximo` enquanto `proximo < totalEquipamentos()`) |
| Detalhe do item | `obterEquipamento(id)` | call | todos |
| Cadastrar item | `cadastrarEquipamento(nome, categoria, precoPorDiaWei, caucaoWei)` | send | qualquer conta |
| Ativar/desativar item | `alterarDisponibilidade(id, ativo)` | send | só o locador do item, e não se estiver `Alugado` |
| Bloquear usuário | `bloquearLocatario(id, endereco, true/false)` | send | só o locador do item |
| Simular preço | `custoTotal(id, dias)` | call | todos |
| **Alugar** | `alugar(id, dias)` com `value = custoTotal` | send **payable** | qualquer conta ≠ locador, não bloqueada, item `Disponivel`, dias 1..30 |
| Meus aluguéis (locatário) | `alugueisDoLocatario(conta)` → ids → `obterAluguel(id)` | call | todos |
| Aluguéis dos meus itens (locador) | `alugueisDoLocador(conta)` → ids → `obterAluguel(id)` | call | todos |
| Prévia da multa | `calcularMulta(aluguelId)` | call | todos |
| Devolver | `devolver(aluguelId)` | send | locatário, aluguel `Ativo` |
| Confirmar recebimento | `confirmarRecebimento(aluguelId)` | send | locador, aluguel `Devolvido` |
| Abrir disputa | `abrirDisputa(aluguelId)` | send | locador, `Devolvido`, **dentro** de 3 dias da devolução |
| Liberar por timeout | `liberarPorTimeout(aluguelId)` | send | locatário, `Devolvido`, **após** 3 dias da devolução |
| Reivindicar por atraso | `reivindicarPorAtraso(aluguelId)` | send | locador, `Ativo`, após `fim + 7 dias` |
| Meu saldo / Sacar | `saldos(conta)` · `sacar(valorWei)` | call / send | todos (saque ≤ saldo) |
| Reputação | `reputacao(conta)` | call | todos |
| **Painel admin** | `DONO()` para detectar o admin; `definirTaxa(bps)`; `resolverDisputa(aluguelId, caucaoParaLocadorWei)` | send | só o dono |

### Quando mostrar cada botão (por estado do aluguel)

| Estado | Locatário vê | Locador vê | Dono vê |
|---|---|---|---|
| Ativo | **Devolver** | **Reivindicar** (habilitar só se agora > `fim` + 7×`DURACAO_DIA`) | — |
| Devolvido | **Liberar por timeout** (habilitar só se agora > `devolvidoEm` + 3×`DURACAO_DIA`) | **Confirmar** e **Disputar** (Disputar só até `devolvidoEm` + 3×`DURACAO_DIA`) | — |
| EmDisputa | aguardando | aguardando | **Resolver** (campo: quanto da caução vai ao locador, de 0 até `caucao`) |
| Concluido / Resolvido | histórico | histórico | — |

Sugestão de UX: depois de `Concluido`/`Resolvido`, mostrar um aviso "Você tem saldo para sacar" quando `saldos(conta) > 0`.

## 5. Eventos (para atualizar a tela e o histórico)

```js
contrato.events.EquipamentoAlugado({ fromBlock: "latest" }).on("data", (ev) => { /* recarregar lista */ });
// histórico: await contrato.getPastEvents("AluguelConcluido", { fromBlock: 0, toBlock: "latest" });
```

`EquipamentoCadastrado`, `DisponibilidadeAlterada`, `LocatarioBloqueioAlterado`, `EquipamentoAlugado`, `EquipamentoDevolvido`, `AluguelConcluido`, `DisputaAberta`, `DisputaResolvida`, `CaucaoReivindicada`, `SaqueRealizado`, `TaxaAlterada`. Campos `indexed` permitem filtrar, por exemplo `getPastEvents("EquipamentoAlugado", { filter: { locatario: conta }, fromBlock: 0 })`.

Depois de cada `send`, mostrar o hash da transação com link `https://sepolia.etherscan.io/tx/<hash>` e estados "aguardando MetaMask → pendente → confirmada/erro".

## 6. Erros: mensagens amigáveis

Se a transação reverter, o erro costuma trazer os dados do revert. Se o web3 não decodificar sozinho, compare o **seletor** (4 primeiros bytes) com a tabela:

| Seletor | Erro | Mensagem sugerida |
|---|---|---|
| `0xade780e3` | `NaoAutorizado(address)` | "Você não tem permissão para esta ação." |
| `0x9b6b4f4e` | `EstadoInvalido(uint8,uint8)` | "O aluguel não está no estado correto para esta ação." |
| `0xcd4c777a` | `ValorIncorreto(uint256,uint256)` | "O valor enviado deve ser exatamente o valor calculado." |
| `0x9d8b89ca` | `SaldoInsuficiente(uint256,uint256)` | "Saldo insuficiente para este saque." |
| `0x14e3e757` | `EquipamentoIndisponivel(uint256,uint8)` | "Este equipamento não está disponível." |
| `0x15cdaf85` | `RegistroInexistente(uint256)` | "Registro não encontrado." |
| `0xe4b9362f` | `ParametroInvalido(bytes32)` | "Parâmetro inválido (veja o campo informado)." |
| `0x4402634b` | `PrazoInvalido(uint256,uint256)` | "Fora do prazo permitido para esta ação." |

Além desses, há reverts com texto (`require`): "Nome deve ter 1 a 64 bytes", "Valor acima da caucao", "Taxa acima do maximo", "Falha ao transferir ETH". Exiba o texto como veio. Para erro `4001` (usuário rejeitou na MetaMask), mostrar "Transação cancelada".

Dica: validar no front **antes** de enviar (item disponível? sou o locador? dias entre 1 e 30?) evita gastar gás à toa, mas o contrato continua sendo a autoridade.

## 7. Valores sugeridos para teste (economiza ETH de faucet)

- Preço por dia: `0.001` ETH · Caução: `0.005` ETH · Aluguel de 2 dias = `0.007` ETH no total.
- Taxa inicial da plataforma: 2% (`taxaBps = 200`).
- Em Sepolia, use ao menos 3 contas MetaMask: **dono**, **locador**, **locatário**.
