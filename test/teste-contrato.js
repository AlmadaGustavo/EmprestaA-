// Teste de integração local: ganache + web3 + solc-js.
// Uso (na pasta do projeto): npm i solc ganache web3 && node test/teste-contrato.js
const ganache = require('ganache');
const { Web3 } = require('web3');
const fs = require('fs');
const path = require('path');
const solc = require('solc');

const SRC = path.join(__dirname, '..', 'contracts', 'AluguelEquipamentos.sol');
const DIA = 100; // "dia" de 100 s para o teste
const ETH = (n) => BigInt(Math.round(n * 1e18));
let ok = 0, falhas = 0;
const check = (cond, msg) => { cond ? (ok++, console.log('  ✔', msg)) : (falhas++, console.log('  ✘ FALHOU:', msg)); };

async function expectRevert(promise, nome) {
  try { await promise; check(false, `${nome} deveria reverter`); }
  catch (e) { check(true, `${nome} reverteu (${(e.cause && e.cause.errorName) || (e.message || '').slice(0, 60)})`); return e; }
}

(async () => {
  const out = JSON.parse(solc.compile(JSON.stringify({
    language: 'Solidity',
    sources: { 'A.sol': { content: fs.readFileSync(SRC, 'utf8') } },
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'paris', outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } }
  })));
  const c = out.contracts['A.sol'].AluguelEquipamentos;
  const provider = ganache.provider({ logging: { quiet: true }, wallet: { totalAccounts: 6, defaultBalance: 1000 }, chain: { hardfork: 'shanghai' } });
  const web3 = new Web3(provider);
  const [dono, locador, locatario, outro, intruso] = await web3.eth.getAccounts();
  const avancar = async (s) => { await provider.request({ method: 'evm_increaseTime', params: [s] }); await provider.request({ method: 'evm_mine', params: [] }); };

  const abi = c.abi;
  const deploy = await new web3.eth.Contract(abi).deploy({ data: '0x' + c.evm.bytecode.object, arguments: [DIA, 200] }).send({ from: dono, gas: 5000000 });
  const k = deploy; // contrato
  const send = (m, from, value = 0n) => m.send({ from, value: value.toString(), gas: 1000000 });
  const cat = web3.utils.padRight(web3.utils.utf8ToHex('CAMERA'), 64);
  const PRECO = ETH(0.01), CAUCAO = ETH(0.1);

  console.log('\n[1] Cadastro e consulta');
  await send(k.methods.cadastrarEquipamento('Canon R6', cat, PRECO.toString(), CAUCAO.toString()), locador);
  await send(k.methods.cadastrarEquipamento('Bike eletrica', web3.utils.padRight(web3.utils.utf8ToHex('BIKE'), 64), PRECO.toString(), CAUCAO.toString()), locador);
  check(Number(await k.methods.totalEquipamentos().call()) === 2, 'totalEquipamentos = 2');
  const eq = await k.methods.obterEquipamento(0).call();
  check(eq.nome === 'Canon R6' && eq.locador.toLowerCase() === locador.toLowerCase(), 'obterEquipamento retorna dados corretos');
  check(typeof eq.precoPorDia === 'bigint', 'web3 v4 devolve uint como BigInt (frontend deve converter)');
  await expectRevert(send(k.methods.cadastrarEquipamento('', cat, 1, 1), locador), 'nome vazio');
  await expectRevert(send(k.methods.cadastrarEquipamento('X', cat, 0, 1), locador), 'preço zero');
  const lista = await k.methods.listarEquipamentos(cat, true, 0, 50).call();
  check(lista.resultado.length === 1 && lista.resultado[0].nome === 'Canon R6', 'filtro por categoria CAMERA retorna 1');
  const todos = await k.methods.listarEquipamentos(web3.utils.padRight('0x0', 64), false, 0, 50).call();
  check(todos.resultado.length === 2, 'sem filtro retorna 2');
  await expectRevert(k.methods.listarEquipamentos(cat, true, 0, 51).call(), 'limite de página > 50');

  console.log('\n[2] Aluguel (valor exato, bloqueio, auto-aluguel)');
  const custo = BigInt(await k.methods.custoTotal(0, 3).call());
  check(custo === PRECO * 3n + CAUCAO, 'custoTotal = preço*dias + caução');
  await expectRevert(send(k.methods.alugar(0, 3), locatario, custo - 1n), 'valor menor que o exigido');
  await expectRevert(send(k.methods.alugar(0, 3), locador, custo), 'locador alugando o próprio item');
  await expectRevert(send(k.methods.alugar(0, 31), locatario, custo), 'dias > 30');
  await send(k.methods.bloquearLocatario(0, intruso, true), locador);
  await expectRevert(send(k.methods.alugar(0, 3), intruso, custo), 'locatário bloqueado (mapping aninhado)');
  await send(k.methods.alugar(0, 3), locatario, custo);
  check(BigInt(await web3.eth.getBalance(k.options.address)) === custo, 'contrato reteve preço + caução');
  check(Number((await k.methods.obterEquipamento(0).call()).status) === 1, 'equipamento -> Alugado');
  await expectRevert(send(k.methods.alugar(0, 1), outro, PRECO + CAUCAO), 'alugar item já alugado');
  await expectRevert(send(k.methods.devolver(0), outro), 'devolver por quem não é locatário');

  console.log('\n[3] Devolução no prazo + confirmação + saques (pull payment)');
  await send(k.methods.devolver(0), locatario);
  check(Number((await k.methods.obterAluguel(0).call()).status) === 1, 'aluguel -> Devolvido');
  await expectRevert(send(k.methods.confirmarRecebimento(0), locatario), 'locatário confirmando o próprio aluguel');
  await send(k.methods.confirmarRecebimento(0), locador);
  const taxa = PRECO * 3n * 200n / 10000n;
  check(BigInt(await k.methods.saldos(locador).call()) === PRECO * 3n - taxa, 'saldo do locador = preço - taxa 2%');
  check(BigInt(await k.methods.saldos(locatario).call()) === CAUCAO, 'caução integral volta ao locatário');
  check(BigInt(await k.methods.saldos(dono).call()) === taxa, 'taxa creditada ao dono');
  check(Number(await k.methods.reputacao(locatario).call()) === 1, 'reputação do locatário +1');
  check(Number((await k.methods.obterEquipamento(0).call()).status) === 0, 'equipamento voltou a Disponivel');
  await expectRevert(send(k.methods.sacar((CAUCAO + 1n).toString()), locatario), 'saque acima do saldo');
  const antes = BigInt(await web3.eth.getBalance(locatario));
  const rc = await send(k.methods.sacar(CAUCAO.toString()), locatario);
  const gasto = BigInt(rc.gasUsed) * BigInt(rc.effectiveGasPrice);
  check(BigInt(await web3.eth.getBalance(locatario)) === antes + CAUCAO - gasto, 'locatário sacou a caução');
  check(BigInt(await k.methods.saldos(locatario).call()) === 0n, 'saldo zerado após saque');
  await expectRevert(send(k.methods.sacar('1'), locatario), 'segundo saque sem saldo');

  console.log('\n[4] Atraso gera multa; timeout libera sem o locador');
  await send(k.methods.alugar(0, 1), locatario, PRECO + CAUCAO);               // aluguel 1
  await avancar(DIA + DIA / 2);                                                    // 1,5 dias após início => 0,5 dia de atraso
  check(BigInt(await k.methods.calcularMulta(1).call()) === PRECO, 'prévia da multa = 1 diária (atraso fracionado arredonda p/ cima)');
  await send(k.methods.devolver(1), locatario);
  await expectRevert(send(k.methods.liberarPorTimeout(1), locatario), 'timeout antes do prazo');
  await avancar(3 * DIA + 5);
  await expectRevert(send(k.methods.abrirDisputa(1), locador), 'disputa depois do prazo');
  const saldoLocBefore = BigInt(await k.methods.saldos(locador).call());
  await send(k.methods.liberarPorTimeout(1), locatario);
  const taxa1 = PRECO * 200n / 10000n;
  check(BigInt(await k.methods.saldos(locador).call()) - saldoLocBefore === PRECO - taxa1 + PRECO, 'locador recebeu aluguel + multa');
  check(BigInt(await k.methods.saldos(locatario).call()) === CAUCAO - PRECO, 'locatário recebeu caução - multa');
  check(Number(await k.methods.reputacao(locatario).call()) === 0, 'reputação -1 por atraso (1 -> 0)');

  console.log('\n[5] Disputa arbitrada pelo dono');
  await send(k.methods.alugar(0, 2), locatario, PRECO * 2n + CAUCAO);          // aluguel 2
  await send(k.methods.devolver(2), locatario);
  await expectRevert(send(k.methods.abrirDisputa(2), intruso), 'disputa por terceiro');
  await send(k.methods.abrirDisputa(2), locador);
  await expectRevert(send(k.methods.resolverDisputa(2, 1), locador), 'locador tentando arbitrar');
  await expectRevert(send(k.methods.resolverDisputa(2, (CAUCAO + 1n).toString()), dono), 'valor acima da caução');
  const sl = BigInt(await k.methods.saldos(locatario).call());
  await send(k.methods.resolverDisputa(2, (CAUCAO / 4n).toString()), dono);
  check(BigInt(await k.methods.saldos(locatario).call()) - sl === CAUCAO - CAUCAO / 4n, 'locatário recebeu 75% da caução');
  check(Number(await k.methods.reputacao(locatario).call()) === -1, 'reputação ficou negativa (int256): -1');
  check(Number((await k.methods.obterAluguel(2).call()).status) === 4, 'aluguel -> Resolvido');

  console.log('\n[6] Abandono (locatário some)');
  await send(k.methods.alugar(1, 1), locatario, PRECO + CAUCAO);               // aluguel 3 (bike)
  await expectRevert(send(k.methods.reivindicarPorAtraso(3), locador), 'reivindicar antes do prazo');
  await avancar(DIA + 7 * DIA + 5);
  const sb = BigInt(await k.methods.saldos(locador).call());
  await send(k.methods.reivindicarPorAtraso(3), locador);
  check(BigInt(await k.methods.saldos(locador).call()) - sb === PRECO - taxa1 + CAUCAO, 'locador ficou com preço + caução');
  check(Number((await k.methods.obterEquipamento(1).call()).status) === 2, 'equipamento -> Inativo');
  check(Number(await k.methods.reputacao(locatario).call()) === -4, 'reputação -3 por abandono (-1 -> -4)');

  console.log('\n[7] Administração e invariante de fundos');
  await expectRevert(send(k.methods.definirTaxa(300), intruso), 'definirTaxa por não-dono');
  await expectRevert(send(k.methods.definirTaxa(1001), dono), 'taxa acima de 10%');
  await send(k.methods.definirTaxa(500), dono);
  check(Number(await k.methods.taxaBps().call()) === 500, 'taxa alterada para 5%');
  await expectRevert(web3.eth.sendTransaction({ from: intruso, to: k.options.address, value: '1' }), 'envio direto de ETH ao contrato');
  let soma = 0n;
  for (const a of [dono, locador, locatario, outro, intruso]) soma += BigInt(await k.methods.saldos(a).call());
  check(BigInt(await web3.eth.getBalance(k.options.address)) === soma, 'INVARIANTE: saldo do contrato = soma dos saldos sacáveis (nenhum ETH preso/criado)');

  console.log(`\nResultado: ${ok} ok, ${falhas} falhas`);
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
