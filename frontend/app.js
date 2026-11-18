'use strict';
// =====================================================================
// AluguelEquipamentos: lógica do frontend (Web3.js 4.x + MetaMask)
// Depende de contrato.js (ABI, ENDERECO_CONTRATO, CHAIN_ID_SEPOLIA)
// =====================================================================

const BLOCO_DEPLOY = 12145310; 
const ETHERSCAN = 'https://sepolia.etherscan.io';
const MAX_EVENTOS = 20;
const DIAS_PRAZO_CONFIRMACAO = 3; // iguais às constantes do contrato
const DIAS_PRAZO_ABANDONO = 7;

let web3;
let contract;
let account;
let donoAddr = '';
let duracaoDia = 86400; // lido do contrato ao conectar
let start = 0;
let busy = false;
const pageSize = 20;

const byId = id => document.getElementById(id);
const categoryZero = `0x${'0'.repeat(64)}`;
const STATUS_EQUIP = ['Disponível', 'Alugado', 'Inativo'];
const STATUS_ALUG = ['Ativo', 'Devolvido', 'Concluído', 'Em disputa', 'Resolvido'];

// ---------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------

function showMessage(text, error = false) {
  const box = byId('message');
  box.textContent = text;
  box.style.background = error ? '#8b2525' : '#222';
  box.style.color = '#fff';
  setTimeout(() => { if (box.textContent === text) { box.textContent = ''; box.style.background = ''; } }, 6000);
}

function toEth(wei) {
  const s = web3.utils.fromWei(String(wei), 'ether');
  const n = Number(s);
  if (n === 0) return '0';
  if (n < 0.000001) return s;
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 6 });
}

function fromEth(eth) {
  return web3.utils.toWei(String(eth), 'ether');
}

function categoryHex(value) {
  return value ? web3.utils.padRight(web3.utils.utf8ToHex(value), 64) : categoryZero;
}

function readCategory(value) {
  try { return web3.utils.hexToUtf8(value).replace(/\0/g, '') || 'OUTROS'; }
  catch { return 'OUTROS'; }
}

function clean(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

const short = addr => `${String(addr).slice(0, 6)}…${String(addr).slice(-4)}`;
const sameAddr = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const fmtDate = sec => (Number(sec) ? new Date(Number(sec) * 1000).toLocaleString('pt-BR') : '—');
const txLink = h => `<a href="${ETHERSCAN}/tx/${h}" target="_blank" rel="noopener">${String(h).slice(0, 10)}…${String(h).slice(-8)}</a>`;

// ---------------------------------------------------------------------
// Erros: transforma erros do contrato/MetaMask em mensagens claras
// ---------------------------------------------------------------------

const MSG_ERRO = {
  NaoAutorizado: 'Você não tem permissão para esta ação com a conta atual.',
  EstadoInvalido: 'O aluguel não está no estado correto para esta ação.',
  ValorIncorreto: 'O valor enviado deve ser exatamente o valor calculado (preço × dias + caução).',
  SaldoInsuficiente: 'Saldo insuficiente no contrato para este saque.',
  EquipamentoIndisponivel: 'Este equipamento não está disponível para esta operação.',
  RegistroInexistente: 'Registro não encontrado.',
  ParametroInvalido: 'Algum parâmetro informado é inválido (confira dias, preço, caução e limites).',
  PrazoInvalido: 'Ação fora do prazo permitido. Veja as datas do aluguel.'
};
const SELETORES = {
  '0xade780e3': 'NaoAutorizado',
  '0x9b6b4f4e': 'EstadoInvalido',
  '0xcd4c777a': 'ValorIncorreto',
  '0x9d8b89ca': 'SaldoInsuficiente',
  '0x14e3e757': 'EquipamentoIndisponivel',
  '0x15cdaf85': 'RegistroInexistente',
  '0xe4b9362f': 'ParametroInvalido',
  '0x4402634b': 'PrazoInvalido'
};

function errorData(e) {
  const candidatos = [e?.data, e?.cause?.data, e?.cause?.cause?.data, e?.innerError?.data, e?.cause?.innerError?.data, e?.error?.data, e?.signature];
  return candidatos.find(d => typeof d === 'string' && /^0x[0-9a-fA-F]{8}/.test(d));
}

function friendlyError(e) {
  const code = e?.code ?? e?.cause?.code ?? e?.innerError?.code;
  const text = String(e?.message || e?.cause?.message || '');
  if (code === 4001 || code === 'ACTION_REJECTED' || /user denied|user rejected|rejected the request/i.test(text)) {
    return 'Transação cancelada: você rejeitou na MetaMask.';
  }
  if (/insufficient funds/i.test(text)) {
    return 'Saldo de ETH insuficiente na carteira para pagar o valor e a taxa de gás.';
  }
  if (code === -32002) return 'Já existe uma solicitação da MetaMask aguardando resposta. Abra a extensão e conclua ou rejeite a solicitação.';
  if (code === 4900 || /disconnected/i.test(text)) return 'A carteira perdeu a conexão. Reconecte a MetaMask e tente novamente.';
  let nome = e?.cause?.errorName || e?.errorName;
  if (!nome) {
    const data = errorData(e);
    if (data) nome = SELETORES[data.slice(0, 10).toLowerCase()];
  }
  if (nome && MSG_ERRO[nome]) return MSG_ERRO[nome];
  const m = text.match(/reverted:?\s*([^\n]*)/i);
  if (m && m[1]) return `O contrato recusou a operação: ${m[1].trim()}`;
  return 'Não foi possível concluir a operação. Confira a rede Sepolia, os dados informados e o saldo da carteira; depois tente novamente.';
}

// ---------------------------------------------------------------------
// Transações: simula, envia, mostra hash/link e estado (pendente, confirmada, falhou)
// ---------------------------------------------------------------------

function setTxStatus(html, kind) {
  const box = byId('txStatus');
  box.hidden = false;
  box.className = `tx ${kind}`;
  box.innerHTML = html;
}

async function runTx(method, { value = '0', label = 'Transação' } = {}) {
  if (busy) return false;
  busy = true;
  document.body.classList.add('busy');
  let hash;
  try {
    setTxStatus(`${clean(label)}: validando…`, 'pending');
    await method.call({ from: account, value }); // simulação: mostra o erro do contrato antes de abrir a MetaMask
    setTxStatus(`${clean(label)}: aguardando você confirmar na MetaMask…`, 'pending');
    const receipt = await method.send({ from: account, value })
      .on('transactionHash', h => {
        hash = h;
        setTxStatus(`${clean(label)}: enviada, <strong>pendente</strong> na rede. Hash: ${txLink(h)}`, 'pending');
      });
    setTxStatus(`${clean(label)}: <strong>confirmada ✔</strong> no bloco ${receipt.blockNumber}. Hash: ${txLink(receipt.transactionHash)}`, 'ok');
    return true;
  } catch (e) {
    setTxStatus(`${clean(label)}: <strong>falhou ✖</strong> ${clean(friendlyError(e))}${hash ? ` Hash: ${txLink(hash)}` : ''}`, 'error');
    return false;
  } finally {
    busy = false;
    document.body.classList.remove('busy');
  }
}

async function refreshAll() {
  await Promise.all([loadEquipment(true), loadRentals(), loadBalance(), loadWallet(), loadEvents(), loadAdmin()]);
}

// ---------------------------------------------------------------------
// Conexão e rede
// ---------------------------------------------------------------------

function showNetworkBanner() { byId('networkBanner').hidden = false; }

async function switchToSepolia() {
  try {
    await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0xaa36a7' }] });
  } catch (e) {
    showMessage(friendlyError(e), true);
  }
}

async function connectWallet(auto = false) {
  if (!window.ethereum) {
    if (!auto) showMessage('Instale a MetaMask para conectar sua carteira.', true);
    return;
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(ENDERECO_CONTRATO)) {
    byId('configBanner').hidden = false;
    if (!auto) showMessage('Configure o endereço do contrato em contrato.js depois do deploy.', true);
    return;
  }
  const btn = byId('connectBtn');
  try {
    btn.disabled = true;
    const chainId = await window.ethereum.request({ method: 'eth_chainId' });
    if (Number(chainId) !== CHAIN_ID_SEPOLIA) {
      showNetworkBanner();
      if (auto) return;
      await switchToSepolia();
      return;
    }
    const accounts = await window.ethereum.request({ method: auto ? 'eth_accounts' : 'eth_requestAccounts' });
    if (!accounts || !accounts.length) return;

    account = accounts[0];
    web3 = new Web3(window.ethereum);
    contract = new web3.eth.Contract(ABI, ENDERECO_CONTRATO);
    duracaoDia = Number(await contract.methods.DURACAO_DIA().call());
    donoAddr = await contract.methods.DONO().call();

    btn.textContent = short(account);
    byId('account').textContent = `Carteira conectada: ${account}`;
    byId('walletInfo').hidden = false;
    byId('roleBadge').textContent = sameAddr(account, donoAddr) ? 'Dono da plataforma' : 'Usuário';
    byId('dayInfo').textContent = duracaoDia === 86400 ? '1 dia = 24 h' : `1 dia do contrato = ${duracaoDia} s`;
    ['listingSection', 'rentalsSection', 'balanceSection', 'eventsSection'].forEach(id => { byId(id).hidden = false; });
    document.body.classList.add('connected');
    await refreshAll();
    if (!auto) showMessage('Carteira conectada à Sepolia.');
  } catch (error) {
    showMessage(friendlyError(error), true);
  } finally {
    btn.disabled = false;
  }
}

async function loadWallet() {
  if (!contract) return;
  try {
    const [bal, rep] = await Promise.all([web3.eth.getBalance(account), contract.methods.reputacao(account).call()]);
    byId('walletBalance').textContent = `${toEth(bal)} ETH`;
    byId('reputation').textContent = String(Number(rep));
  } catch (error) { showMessage(friendlyError(error), true); }
}

// ---------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------

async function loadEquipment(reset = false) {
  if (!contract) return;
  if (reset) start = 0;
  const category = categoryHex(byId('categoryFilter').value);
  try {
    const page = await contract.methods.listarEquipamentos(category, byId('availableOnly').checked, start, pageSize).call();
    const equipment = page.resultado || page[0];
    const next = Number(page.proximo ?? page[1]);
    const catalog = byId('catalog');
    const bloqueios = await Promise.all(equipment.map(item =>
      sameAddr(item.locador, account) ? false : contract.methods.bloqueados(item.id, account).call()));

    if (reset) catalog.innerHTML = '';
    if (equipment.length === 0 && start === 0) {
      catalog.textContent = 'Nenhum equipamento encontrado.';
    } else {
      equipment.forEach((item, i) => {
        const status = Number(item.status);
        const isOwner = sameAddr(item.locador, account);
        const blocked = bloqueios[i];
        const element = document.createElement('div');
        element.className = 'item';
        let action;
        if (isOwner) {
          action = `<button data-availability="${item.id}" data-activate="${status === 2}" ${status === 1 ? 'disabled title="Não é possível alterar durante um aluguel"' : ''}>${status === 2 ? 'Ativar' : 'Desativar'}</button>`;
        } else if (blocked) {
          action = '<button disabled>Você foi bloqueado pelo locador</button>';
        } else {
          action = `<button data-rent="${item.id}" ${status === 0 ? '' : 'disabled'}>Alugar</button>`;
        }
        element.innerHTML = `
          <strong>#${item.id} ${clean(item.nome)}</strong> (${clean(readCategory(item.categoria))})<br>
          ${toEth(item.precoPorDia)} ETH por dia · Caução: ${toEth(item.caucao)} ETH<br>
          Status: ${STATUS_EQUIP[status]} · Locador: ${short(item.locador)}${isOwner ? ' (você)' : ''}<br>
          ${action}`;
        catalog.appendChild(element);
      });
    }
    start = next;
    const total = Number(await contract.methods.totalEquipamentos().call());
    byId('loadMore').hidden = start >= total;
  } catch (error) {
    showMessage(friendlyError(error), true);
  }
}

// ---------------------------------------------------------------------
// Aluguel (modal)
// ---------------------------------------------------------------------

async function beginRental(id) {
  try {
    const equipment = await contract.methods.obterEquipamento(id).call();
    byId('rentForm').elements.id.value = id;
    byId('rentName').textContent = `#${id} ${equipment.nome}`;
    byId('rentDialog').showModal();
    await updateRentalPrice();
  } catch (error) {
    showMessage(friendlyError(error), true);
  }
}

async function updateRentalPrice() {
  const id = byId('rentForm').elements.id.value;
  const days = byId('rentForm').elements.days.value;
  const warn = byId('rentWarning');
  warn.textContent = '';
  if (!id || !days || !contract) return;
  try {
    const total = await contract.methods.custoTotal(id, days).call();
    byId('rentTotal').textContent = `${toEth(total)} ETH`;
    const bal = await web3.eth.getBalance(account);
    if (BigInt(total) > BigInt(bal)) warn.textContent = 'Atenção: seu saldo de ETH é menor que o total (sem contar a taxa de gás).';
  } catch { byId('rentTotal').textContent = '— ETH'; }
}

// ---------------------------------------------------------------------
// Meus aluguéis
// ---------------------------------------------------------------------

async function loadRentals() {
  if (!contract || !account) return;
  try {
    const [tenantIds, ownerIds] = await Promise.all([
      contract.methods.alugueisDoLocatario(account).call(),
      contract.methods.alugueisDoLocador(account).call()
    ]);
    const ids = [...new Set([...tenantIds, ...ownerIds].map(String))].sort((a, b) => Number(b) - Number(a));
    const container = byId('rentals');
    container.innerHTML = '';
    if (!ids.length) { container.textContent = 'Você ainda não tem aluguéis.'; return; }

    const agora = Number((await web3.eth.getBlock('latest')).timestamp); // relógio da blockchain
    const rows = await Promise.all(ids.map(async id => {
      const rental = await contract.methods.obterAluguel(id).call();
      const equipment = await contract.methods.obterEquipamento(rental.equipamentoId).call();
      const status = Number(rental.status);
      const multa = status <= 1 ? await contract.methods.calcularMulta(id).call() : '0';
      return { id, rental, equipment, status, multa };
    }));

    for (const { id, rental, equipment, status, multa } of rows) {
      const tenant = sameAddr(rental.locatario, account);
      const limiteConfirm = Number(rental.devolvidoEm) + DIAS_PRAZO_CONFIRMACAO * duracaoDia;
      const limiteAbandono = Number(rental.fim) + DIAS_PRAZO_ABANDONO * duracaoDia;
      let actions = '';
      let hint = '';

      if (status === 0 && tenant) {
        actions += `<button data-rental-action="devolver" data-id="${id}">Devolver</button>`;
        if (BigInt(multa) > 0n) hint = `Atraso: se devolver agora, a multa será ${toEth(multa)} ETH.`;
      }
      if (status === 0 && !tenant) {
        const ok = agora > limiteAbandono;
        actions += `<button data-rental-action="atraso" data-id="${id}" ${ok ? '' : 'disabled'}>Reivindicar por atraso</button>`;
        hint = ok ? '' : `Reivindicação liberada após ${fmtDate(limiteAbandono)}.`;
      }
      if (status === 1 && !tenant) {
        const podeDisputar = agora <= limiteConfirm;
        actions += `<button data-rental-action="confirmar" data-id="${id}">Confirmar recebimento</button>`;
        actions += `<button data-rental-action="disputa" data-id="${id}" ${podeDisputar ? '' : 'disabled'}>Abrir disputa</button>`;
        hint = podeDisputar ? `Você pode contestar até ${fmtDate(limiteConfirm)}.` : 'Prazo para contestar encerrado.';
      }
      if (status === 1 && tenant) {
        const ok = agora > limiteConfirm;
        actions += `<button data-rental-action="timeout" data-id="${id}" ${ok ? '' : 'disabled'}>Liberar por timeout</button>`;
        hint = ok ? 'O locador não respondeu no prazo: você pode liberar o aluguel.' : `Aguardando o locador até ${fmtDate(limiteConfirm)}.`;
      }
      if (status === 3) hint = 'Aguardando decisão do dono da plataforma.';

      const row = document.createElement('div');
      row.className = 'rental';
      row.innerHTML = `
        <strong>${clean(equipment.nome)}</strong> — Aluguel #${id}<br>
        ${tenant ? 'Você alugou' : 'Seu equipamento'} · <strong>${STATUS_ALUG[status]}</strong><br>
        ${rental.dias} dia(s) · Valor: ${toEth(rental.precoTotal)} ETH · Caução: ${toEth(rental.caucao)} ETH<br>
        Início: ${fmtDate(rental.inicio)} · Fim: ${fmtDate(rental.fim)} · Devolvido: ${fmtDate(rental.devolvidoEm)}<br>
        ${BigInt(multa) > 0n && status <= 1 ? `Multa por atraso: ${toEth(multa)} ETH<br>` : ''}
        ${hint ? `<small>${clean(hint)}</small><br>` : ''}
        ${actions}`;
      container.appendChild(row);
    }
  } catch (error) {
    showMessage(friendlyError(error), true);
  }
}

// ---------------------------------------------------------------------
// Saldo no contrato
// ---------------------------------------------------------------------

async function loadBalance() {
  if (!contract || !account) return;
  try {
    const balance = await contract.methods.saldos(account).call();
    byId('balance').textContent = `${toEth(balance)} ETH`;
    byId('balance').dataset.wei = String(balance);
  } catch (error) { showMessage(friendlyError(error), true); }
}

// ---------------------------------------------------------------------
// Histórico de eventos (getPastEvents)
// ---------------------------------------------------------------------

function describeEvent(ev) {
  const v = ev.returnValues;
  switch (ev.event) {
    case 'EquipamentoCadastrado': return `Equipamento #${v.id} “${clean(v.nome)}” cadastrado (${toEth(v.precoPorDia)} ETH/dia, caução ${toEth(v.caucao)} ETH)`;
    case 'DisponibilidadeAlterada': return `Equipamento #${v.id} agora está ${STATUS_EQUIP[Number(v.status)]}`;
    case 'LocatarioBloqueioAlterado': return `Equipamento #${v.equipamentoId}: ${short(v.locatario)} ${v.bloqueado ? 'bloqueado' : 'desbloqueado'}`;
    case 'EquipamentoAlugado': return `Aluguel #${v.aluguelId}: equipamento #${v.equipamentoId} alugado por ${v.dias} dia(s), ${toEth(v.valorPago)} ETH pagos`;
    case 'EquipamentoDevolvido': return `Aluguel #${v.aluguelId} devolvido (multa ${toEth(v.multa)} ETH)`;
    case 'AluguelConcluido': return `Aluguel #${v.aluguelId} concluído (multa ${toEth(v.multa)} ETH)`;
    case 'DisputaAberta': return `Disputa aberta no aluguel #${v.aluguelId}`;
    case 'DisputaResolvida': return `Disputa do aluguel #${v.aluguelId} resolvida: ${toEth(v.caucaoParaLocador)} ETH da caução ao locador`;
    case 'CaucaoReivindicada': return `Aluguel #${v.aluguelId}: caução reivindicada por atraso (${toEth(v.valor)} ETH)`;
    case 'SaqueRealizado': return `${short(v.conta)} sacou ${toEth(v.valor)} ETH`;
    case 'TaxaAlterada': return `Taxa da plataforma alterada de ${Number(v.taxaAntiga) / 100}% para ${Number(v.taxaNova) / 100}%`;
    default: return clean(ev.event || 'Evento');
  }
}

// Consulta eventos em lotes para respeitar o limite do RPC
async function getPastEventsInChunks(eventName, fromBlock = BLOCO_DEPLOY) {
  const latestHex = await window.ethereum.request({
    method: 'eth_blockNumber'
  });

  const latestBlock = parseInt(latestHex, 16);
  const chunkSize = 5000;
  const allEvents = [];

  for (let start = Number(fromBlock); start <= latestBlock; start += chunkSize) {
    const end = Math.min(start + chunkSize - 1, latestBlock);

    const events = await contract.getPastEvents(eventName, {
      fromBlock: start,
      toBlock: end
    });

    allEvents.push(...events);
  }

  return allEvents;
}

async function loadEvents() {
  if (!contract) return;
  const list = byId('events');
  try {
    const evs = await getPastEventsInChunks('allEvents');
    const recent = evs
      .sort((a, b) => Number(b.blockNumber) - Number(a.blockNumber) || Number(b.logIndex) - Number(a.logIndex))
      .slice(0, MAX_EVENTOS);
    list.innerHTML = recent.length
      ? recent.map(ev => `<li>${describeEvent(ev)} <small>(bloco ${ev.blockNumber} · ${txLink(ev.transactionHash)})</small></li>`).join('')
      : '<li>Nenhum evento ainda.</li>';
  } catch (error) {
    list.innerHTML = `<li>Não foi possível carregar o histórico: ${clean(friendlyError(error))}</li>`;
  }
}

// ---------------------------------------------------------------------
// Painel do dono (visível só para o endereço DONO)
// ---------------------------------------------------------------------

async function loadAdmin() {
  const section = byId('adminSection');
  if (!contract || !sameAddr(account, donoAddr)) { section.hidden = true; return; }
  section.hidden = false;
  try {
    const bps = Number(await contract.methods.taxaBps().call());
    byId('currentTax').textContent = `${bps} bps (${bps / 100}%)`;

    const evs = await getPastEventsInChunks('DisputaAberta');
    const ids = [...new Set(evs.map(e => String(e.returnValues.aluguelId)))];
    const list = byId('disputes');
    const open = [];
    for (const id of ids) {
      const r = await contract.methods.obterAluguel(id).call();
      if (Number(r.status) === 3) open.push({ id, r });
    }
    list.innerHTML = open.length ? '' : 'Nenhuma disputa aberta.';
    for (const { id, r } of open) {
      const div = document.createElement('div');
      div.className = 'rental';
      div.innerHTML = `
        <strong>Aluguel #${id}</strong> · Equipamento #${r.equipamentoId}<br>
        Locador: ${short(r.locador)} · Locatário: ${short(r.locatario)}<br>
        Caução em disputa: ${toEth(r.caucao)} ETH<br>
        <label>Caução ao locador (ETH, de 0 a ${toEth(r.caucao)})
          <input type="number" min="0" step="any" value="0" data-dispute-input="${id}" data-max="${r.caucao}">
        </label>
        <button data-resolve="${id}">Resolver disputa</button>`;
      list.appendChild(div);
    }
  } catch (error) {
    showMessage(friendlyError(error), true);
  }
}

// ---------------------------------------------------------------------
// Eventos de interface
// ---------------------------------------------------------------------

byId('connectBtn').addEventListener('click', () => connectWallet(false));
byId('switchNetworkBtn').addEventListener('click', switchToSepolia);
byId('refreshBtn').addEventListener('click', () => loadEquipment(true));
byId('refreshRentals').addEventListener('click', loadRentals);
byId('refreshEvents').addEventListener('click', loadEvents);
byId('categoryFilter').addEventListener('change', () => loadEquipment(true));
byId('availableOnly').addEventListener('change', () => loadEquipment(true));
byId('loadMore').addEventListener('click', () => loadEquipment(false));
byId('rentForm').elements.days.addEventListener('input', updateRentalPrice);
byId('cancelRent').addEventListener('click', () => byId('rentDialog').close());

byId('catalog').addEventListener('click', async event => {
  const rentButton = event.target.closest('[data-rent]');
  const availabilityButton = event.target.closest('[data-availability]');
  if (rentButton) await beginRental(rentButton.dataset.rent);
  if (availabilityButton) {
    const ok = await runTx(
      contract.methods.alterarDisponibilidade(availabilityButton.dataset.availability, availabilityButton.dataset.activate === 'true'),
      { label: 'Alterar disponibilidade' });
    if (ok) await refreshAll();
  }
});

byId('rentForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const days = Number(form.elements.days.value);
  if (!Number.isInteger(days) || days < 1 || days > 30) { showMessage('Informe de 1 a 30 dias.', true); return; }
  try {
    const total = await contract.methods.custoTotal(form.elements.id.value, days).call();
    byId('rentDialog').close();
    const ok = await runTx(contract.methods.alugar(form.elements.id.value, days), { value: String(total), label: 'Aluguel' });
    if (ok) await refreshAll();
  } catch (error) { showMessage(friendlyError(error), true); }
});

byId('listingForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const nome = form.elements.name.value.trim();
  const preco = form.elements.price.value;
  const caucao = form.elements.deposit.value;
  if (!nome || new TextEncoder().encode(nome).length > 64) { showMessage('O nome deve ter de 1 a 64 caracteres.', true); return; }
  if (!(Number(preco) > 0) || !(Number(caucao) > 0)) { showMessage('Preço e caução devem ser maiores que zero.', true); return; }
  let precoWei, caucaoWei;
  try { precoWei = fromEth(preco); caucaoWei = fromEth(caucao); }
  catch { showMessage('Informe valores válidos com até 18 casas decimais.', true); return; }
  const ok = await runTx(
    contract.methods.cadastrarEquipamento(nome, categoryHex(form.elements.category.value), precoWei, caucaoWei),
    { label: 'Cadastro de equipamento' });
  if (ok) { form.reset(); await refreshAll(); }
});

byId('blockForm').addEventListener('submit', async event => {
  event.preventDefault();
  const f = event.currentTarget.elements;
  if (!web3.utils.isAddress(f.address.value)) { showMessage('Endereço do locatário inválido.', true); return; }
  const ok = await runTx(
    contract.methods.bloquearLocatario(f.id.value, f.address.value, f.block.checked),
    { label: f.block.checked ? 'Bloquear locatário' : 'Desbloquear locatário' });
  if (ok) { event.currentTarget.reset(); await refreshAll(); }
});

byId('withdrawForm').addEventListener('submit', async event => {
  event.preventDefault();
  const amount = event.currentTarget.elements.amount.value;
  if (!(Number(amount) > 0)) { showMessage('Informe um valor maior que zero.', true); return; }
  let amountWei;
  try { amountWei = fromEth(amount); }
  catch { showMessage('Informe um valor válido com até 18 casas decimais.', true); return; }
  const ok = await runTx(contract.methods.sacar(amountWei), { label: 'Saque' });
  if (ok) { event.currentTarget.reset(); await refreshAll(); }
});

byId('withdrawAll').addEventListener('click', async () => {
  const wei = byId('balance').dataset.wei || '0';
  if (BigInt(wei) === 0n) { showMessage('Você não tem saldo para sacar.', true); return; }
  const ok = await runTx(contract.methods.sacar(wei), { label: 'Saque total' });
  if (ok) await refreshAll();
});

byId('rentals').addEventListener('click', async event => {
  const button = event.target.closest('[data-rental-action]');
  if (!button) return;
  const id = button.dataset.id;
  const acoes = {
    devolver: ['Devolução', () => contract.methods.devolver(id)],
    atraso: ['Reivindicação por atraso', () => contract.methods.reivindicarPorAtraso(id)],
    confirmar: ['Confirmação de recebimento', () => contract.methods.confirmarRecebimento(id)],
    disputa: ['Abertura de disputa', () => contract.methods.abrirDisputa(id)],
    timeout: ['Liberação por timeout', () => contract.methods.liberarPorTimeout(id)]
  };
  const [label, build] = acoes[button.dataset.rentalAction];
  if (await runTx(build(), { label })) await refreshAll();
});

byId('taxForm').addEventListener('submit', async event => {
  event.preventDefault();
  const bps = Number(event.currentTarget.elements.bps.value);
  if (!Number.isInteger(bps) || bps < 0 || bps > 1000) { showMessage('A taxa deve ser um número inteiro entre 0 e 1000 bps (0% a 10%).', true); return; }
  if (await runTx(contract.methods.definirTaxa(bps), { label: 'Alterar taxa' })) {
    event.currentTarget.reset();
    await refreshAll();
  }
});

byId('adminSection').addEventListener('click', async event => {
  const button = event.target.closest('[data-resolve]');
  if (!button) return;
  const id = button.dataset.resolve;
  const input = byId('adminSection').querySelector(`[data-dispute-input="${id}"]`);
  let wei;
  try { wei = fromEth(input.value || '0'); } catch { showMessage('Valor inválido.', true); return; }
  if (BigInt(wei) > BigInt(input.dataset.max)) { showMessage('O valor não pode ser maior que a caução.', true); return; }
  if (await runTx(contract.methods.resolverDisputa(id, wei), { label: 'Resolver disputa' })) await refreshAll();
});

// MetaMask: recarrega ao trocar de conta ou de rede
if (window.ethereum) {
  window.ethereum.on('accountsChanged', () => location.reload());
  window.ethereum.on('chainChanged', () => location.reload());
  // Se a carteira já autorizou este site, reconecta sozinho (sem abrir pop-up)
  window.ethereum.request({ method: 'eth_chainId' }).then(chainId => {
    if (Number(chainId) !== CHAIN_ID_SEPOLIA) showNetworkBanner();
  }).catch(() => {});
  connectWallet(true);
}
if (!/^0x[a-fA-F0-9]{40}$/.test(ENDERECO_CONTRATO)) byId('configBanner').hidden = false;