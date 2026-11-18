let web3;
let contract;
let account;
let start = 0;
const pageSize = 20;

const byId = id => document.getElementById(id);
const categoryZero = `0x${'0'.repeat(64)}`;

function showMessage(text, error = false) {
  const box = byId('message');
  box.textContent = text;
  box.style.background = error ? '#8b2525' : '#222';
  setTimeout(() => { if (box.textContent === text) box.textContent = ''; }, 5000);
}

function toEth(wei) {
  return Number(web3.utils.fromWei(String(wei), 'ether')).toLocaleString('pt-BR', { maximumFractionDigits: 6 });
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

async function connectWallet() {
  if (!window.ethereum) {
    showMessage('Instale a MetaMask para conectar sua carteira.', true);
    return;
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(ENDERECO_CONTRATO)) {
    showMessage('Configure o endereço do contrato em contrato.js depois do deploy.', true);
    return;
  }

  try {
    const chainId = await window.ethereum.request({ method: 'eth_chainId' });
    if (Number(chainId) !== CHAIN_ID_SEPOLIA) {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0xaa36a7' }] });
    }
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    account = accounts[0];
    web3 = new Web3(window.ethereum);
    contract = new web3.eth.Contract(ABI, ENDERECO_CONTRATO);
    byId('connectBtn').textContent = `${account.slice(0, 6)}...${account.slice(-4)}`;
    byId('account').textContent = `Carteira conectada: ${account}`;
    byId('listingSection').hidden = false;
    byId('rentalsSection').hidden = false;
    byId('balanceSection').hidden = false;
    document.body.classList.add('connected');
    await Promise.all([loadEquipment(true), loadRentals(), loadBalance()]);
    showMessage('Carteira conectada à Sepolia.');
  } catch (error) {
    showMessage(error.message || 'Não foi possível conectar a carteira.', true);
  }
}

async function loadEquipment(reset = false) {
  if (!contract) return;
  if (reset) start = 0;
  const category = categoryHex(byId('categoryFilter').value);
  try {
    const page = await contract.methods.listarEquipamentos(
      category, byId('availableOnly').checked, start, pageSize
    ).call();
    const equipment = page.resultado || page[0];
    const next = Number(page.proximo || page[1]);
    const catalog = byId('catalog');

    if (reset) catalog.innerHTML = '';
    if (equipment.length === 0 && start === 0) {
      catalog.textContent = 'Nenhum equipamento encontrado.';
    } else {
      equipment.forEach(item => {
        const categoryName = readCategory(item.categoria);
        const available = Number(item.status) === 0;
        const isOwner = item.locador.toLowerCase() === account.toLowerCase();
        const element = document.createElement('div');
        element.className = 'item';
        element.innerHTML = `
          <strong>${clean(item.nome)}</strong> (${clean(categoryName)})<br>
          ${toEth(item.precoPorDia)} ETH por dia · Caução: ${toEth(item.caucao)} ETH<br>
          Status: ${available ? 'Disponível' : Number(item.status) === 1 ? 'Alugado' : 'Inativo'}<br>
          ${isOwner
            ? `<button data-availability="${item.id}" data-activate="${Number(item.status) === 2}">${Number(item.status) === 2 ? 'Ativar' : 'Desativar'}</button>`
            : `<button data-rent="${item.id}" ${available ? '' : 'disabled'}>Alugar</button>`}`;
        catalog.appendChild(element);
      });
    }
    start = next;
    const total = Number(await contract.methods.totalEquipamentos().call());
    byId('loadMore').hidden = start >= total;
  } catch (error) {
    showMessage(error.message || 'Erro ao carregar equipamentos.', true);
  }
}

async function beginRental(id) {
  try {
    const equipment = await contract.methods.obterEquipamento(id).call();
    byId('rentForm').elements.id.value = id;
    byId('rentName').textContent = equipment.nome;
    byId('rentDialog').showModal();
    await updateRentalPrice();
  } catch (error) {
    showMessage(error.message || 'Não foi possível abrir o aluguel.', true);
  }
}

async function updateRentalPrice() {
  const id = byId('rentForm').elements.id.value;
  const days = byId('rentForm').elements.days.value;
  if (!id || !days || !contract) return;
  try {
    const total = await contract.methods.custoTotal(id, days).call();
    byId('rentTotal').textContent = `${toEth(total)} ETH`;
  } catch { byId('rentTotal').textContent = '— ETH'; }
}

async function loadRentals() {
  if (!contract || !account) return;
  try {
    const [tenantIds, ownerIds] = await Promise.all([
      contract.methods.alugueisDoLocatario(account).call(),
      contract.methods.alugueisDoLocador(account).call()
    ]);
    const rentals = [...new Set([...tenantIds, ...ownerIds].map(String))].reverse();
    const container = byId('rentals');
    container.innerHTML = '';
    if (!rentals.length) { container.textContent = 'Você ainda não tem aluguéis.'; return; }

    for (const id of rentals) {
      const rental = await contract.methods.obterAluguel(id).call();
      const equipment = await contract.methods.obterEquipamento(rental.equipamentoId).call();
      const tenant = rental.locatario.toLowerCase() === account.toLowerCase();
      const statuses = ['Ativo', 'Devolvido', 'Concluído', 'Em disputa', 'Resolvido'];
      const row = document.createElement('div');
      row.className = 'rental';
      let actions = '';
      if (Number(rental.status) === 0 && tenant) actions += `<button data-rental-action="devolver" data-id="${id}">Devolver</button>`;
      if (Number(rental.status) === 0 && !tenant) actions += `<button data-rental-action="atraso" data-id="${id}">Reivindicar por atraso</button>`;
      if (Number(rental.status) === 1 && !tenant) {
        actions += `<button data-rental-action="confirmar" data-id="${id}">Confirmar recebimento</button>`;
        actions += `<button data-rental-action="disputa" data-id="${id}">Abrir disputa</button>`;
      }
      if (Number(rental.status) === 1 && tenant) actions += `<button data-rental-action="timeout" data-id="${id}">Liberar por timeout</button>`;
      row.innerHTML = `<strong>${clean(equipment.nome)}</strong> — Aluguel #${id}<br>${tenant ? 'Você alugou' : 'Seu equipamento'} · ${statuses[Number(rental.status)]}<br>${actions}`;
      container.appendChild(row);
    }
  } catch (error) {
    showMessage(error.message || 'Erro ao carregar aluguéis.', true);
  }
}

async function loadBalance() {
  if (!contract || !account) return;
  try {
    const balance = await contract.methods.saldos(account).call();
    byId('balance').textContent = `${toEth(balance)} ETH`;
  } catch (error) { showMessage(error.message, true); }
}

async function sendTransaction(method, value) {
  const options = { from: account };
  if (value) options.value = value;
  const result = await method.send(options);
  showMessage(`Transação confirmada: ${result.transactionHash}`);
}

byId('connectBtn').addEventListener('click', connectWallet);
byId('refreshBtn').addEventListener('click', () => loadEquipment(true));
byId('refreshRentals').addEventListener('click', loadRentals);
byId('categoryFilter').addEventListener('change', () => loadEquipment(true));
byId('availableOnly').addEventListener('change', () => loadEquipment(true));
byId('loadMore').addEventListener('click', () => loadEquipment(false));
byId('rentForm').elements.days.addEventListener('input', updateRentalPrice);
byId('cancelRent').addEventListener('click', () => byId('rentDialog').close());

byId('catalog').addEventListener('click', async event => {
  const rentButton = event.target.closest('[data-rent]');
  const availabilityButton = event.target.closest('[data-availability]');
  try {
    if (rentButton) await beginRental(rentButton.dataset.rent);
    if (availabilityButton) {
      await sendTransaction(contract.methods.alterarDisponibilidade(
        availabilityButton.dataset.availability, availabilityButton.dataset.activate === 'true'
      ));
      await loadEquipment(true);
    }
  } catch (error) { showMessage(error.message || 'A transação falhou.', true); }
});

byId('rentForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const total = await contract.methods.custoTotal(form.elements.id.value, form.elements.days.value).call();
    await sendTransaction(contract.methods.alugar(form.elements.id.value, form.elements.days.value), total);
    byId('rentDialog').close();
    await Promise.all([loadEquipment(true), loadRentals(), loadBalance()]);
  } catch (error) { showMessage(error.message || 'Não foi possível alugar.', true); }
});

byId('listingForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    await sendTransaction(contract.methods.cadastrarEquipamento(
      form.elements.name.value,
      categoryHex(form.elements.category.value),
      fromEth(form.elements.price.value),
      fromEth(form.elements.deposit.value)
    ));
    form.reset();
    await loadEquipment(true);
  } catch (error) { showMessage(error.message || 'Não foi possível cadastrar.', true); }
});

byId('withdrawForm').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    await sendTransaction(contract.methods.sacar(fromEth(event.currentTarget.elements.amount.value)));
    event.currentTarget.reset();
    await loadBalance();
  } catch (error) { showMessage(error.message || 'Não foi possível sacar.', true); }
});

byId('rentals').addEventListener('click', async event => {
  const button = event.target.closest('[data-rental-action]');
  if (!button) return;
  const id = button.dataset.id;
  const methods = {
    devolver: () => contract.methods.devolver(id),
    atraso: () => contract.methods.reivindicarPorAtraso(id),
    confirmar: () => contract.methods.confirmarRecebimento(id),
    disputa: () => contract.methods.abrirDisputa(id),
    timeout: () => contract.methods.liberarPorTimeout(id)
  };
  try {
    await sendTransaction(methods[button.dataset.rentalAction]());
    await Promise.all([loadRentals(), loadEquipment(true), loadBalance()]);
  } catch (error) { showMessage(error.message || 'A ação não foi concluída.', true); }
});

if (window.ethereum) {
  window.ethereum.on('accountsChanged', () => location.reload());
  window.ethereum.on('chainChanged', () => location.reload());
}
