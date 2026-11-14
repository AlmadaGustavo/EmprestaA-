// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AluguelEquipamentos
/// @notice Marketplace descentralizado de aluguel de equipamentos (câmeras, bikes, kits de laboratório...)
///         com caução custodiada pelo contrato. Locador e locatário não precisam confiar um no outro:
///         o ETH fica retido e só é liberado conforme o estado do aluguel.
/// @dev Pagamentos usam o padrão "pull payment": as regras só creditam `saldos`; quem recebe chama `sacar`.
///      Nenhuma biblioteca externa foi usada.
contract AluguelEquipamentos {
    // =====================================================================
    // [Recurso: StructsEEnums]
    // =====================================================================

    /// @notice Estado de um equipamento no catálogo
    enum StatusEquipamento {
        Disponivel, // 0 - pode ser alugado
        Alugado, // 1 - em uso por um locatário
        Inativo // 2 - retirado do catálogo pelo locador
    }

    /// @notice Ciclo de vida de um aluguel
    /// Ativo -> Devolvido -> Concluido
    ///                    \-> EmDisputa -> Resolvido
    /// Ativo -> Concluido (locador reivindica caução por abandono)
    enum StatusAluguel {
        Ativo, // 0 - equipamento com o locatário
        Devolvido, // 1 - locatário devolveu; aguarda confirmação do locador
        Concluido, // 2 - valores liberados
        EmDisputa, // 3 - locador contestou; aguarda decisão do dono (árbitro)
        Resolvido // 4 - disputa decidida
    }

    /// @notice Equipamento cadastrado por um locador
    struct Equipamento {
        uint256 id;
        string nome;
        bytes32 categoria;
        uint256 precoPorDia; // em wei
        uint256 caucao; // em wei
        address payable locador;
        StatusEquipamento status;
    }

    /// @notice Registro de um aluguel (os valores ficam "congelados" no momento da locação)
    struct Aluguel {
        uint256 id;
        uint256 equipamentoId;
        address payable locador;
        address payable locatario;
        uint256 dias;
        uint256 inicio;
        uint256 fim;
        uint256 devolvidoEm; // 0 enquanto não devolvido
        uint256 precoTotal;
        uint256 caucao;
        uint256 taxaBps; // taxa da plataforma vigente quando alugou
        StatusAluguel status;
    }

    // =====================================================================
    // [Recurso: TiposDeDados]  (constant, immutable, uint256, int256, bool, address, string, bytes32)
    // =====================================================================

    /// @notice Nome do contrato (string constante)
    string public constant NOME = "AluguelEquipamentos";
    /// @notice Base de cálculo da taxa (10.000 bps = 100%)
    uint256 public constant BPS_BASE = 10_000;
    /// @notice Taxa máxima que o dono pode configurar (10%)
    uint256 public constant TAXA_MAXIMA_BPS = 1_000;
    /// @notice Máximo de dias por aluguel
    uint256 public constant MAX_DIAS_ALUGUEL = 30;
    /// @notice Máximo de itens por consulta paginada (limita o laço)
    uint256 public constant MAX_POR_PAGINA = 50;
    /// @notice Dias que o locador tem para confirmar/contestar uma devolução
    uint256 public constant DIAS_PRAZO_CONFIRMACAO = 3;
    /// @notice Dias de atraso após o fim do aluguel para considerar abandono
    uint256 public constant DIAS_PRAZO_ABANDONO = 7;

    /// @notice Dono/árbitro da plataforma (address payable imutável)
    address payable public immutable DONO;
    /// @notice Duração de um "dia" em segundos (86400 em produção; menor em demonstrações)
    uint256 public immutable DURACAO_DIA;

    /// @notice Taxa atual da plataforma em basis points
    uint256 public taxaBps;
    /// @notice Quantidade de aluguéis já criados
    uint256 public totalAlugueis;

    // =====================================================================
    // [Recurso: ArraysEMappings]
    // =====================================================================

    /// @dev Array dinâmico com o catálogo; o id do equipamento é o seu índice
    Equipamento[] private _equipamentos;
    /// @dev mapping -> struct: id do aluguel => registro
    mapping(uint256 => Aluguel) private _alugueis;
    /// @notice mapping simples: saldo (em wei) que cada conta pode sacar
    mapping(address => uint256) public saldos;
    /// @notice mapping simples com tipo int: reputação (pode ficar negativa)
    mapping(address => int256) public reputacao;
    /// @notice mapping aninhado: equipamentoId => locatário => bloqueado pelo locador?
    mapping(uint256 => mapping(address => bool)) public bloqueados;
    /// @dev ids dos aluguéis de cada locatário
    mapping(address => uint256[]) private _alugueisDoLocatario;
    /// @dev ids dos aluguéis de cada locador
    mapping(address => uint256[]) private _alugueisDoLocador;

    /// @dev trava anti-reentrância
    bool private _travado;

    // =====================================================================
    // [Recurso: EventosEErros]
    // =====================================================================

    event EquipamentoCadastrado(
        uint256 indexed id,
        address indexed locador,
        bytes32 categoria,
        string nome,
        uint256 precoPorDia,
        uint256 caucao
    );
    event DisponibilidadeAlterada(uint256 indexed id, StatusEquipamento status);
    event LocatarioBloqueioAlterado(uint256 indexed equipamentoId, address indexed locatario, bool bloqueado);
    event EquipamentoAlugado(
        uint256 indexed aluguelId,
        uint256 indexed equipamentoId,
        address indexed locatario,
        uint256 dias,
        uint256 valorPago
    );
    event EquipamentoDevolvido(uint256 indexed aluguelId, address indexed locatario, uint256 multa);
    event AluguelConcluido(
        uint256 indexed aluguelId,
        address indexed locador,
        address indexed locatario,
        uint256 multa
    );
    event DisputaAberta(uint256 indexed aluguelId, address indexed locador);
    event DisputaResolvida(uint256 indexed aluguelId, address indexed arbitro, uint256 caucaoParaLocador);
    event CaucaoReivindicada(uint256 indexed aluguelId, address indexed locador, uint256 valor);
    event SaqueRealizado(address indexed conta, uint256 valor);
    event TaxaAlterada(uint256 taxaAntiga, uint256 taxaNova);

    /// @notice Chamador sem permissão para a ação
    error NaoAutorizado(address chamador);
    /// @notice Aluguel não está no estado exigido pela função
    error EstadoInvalido(StatusAluguel atual, StatusAluguel esperado);
    /// @notice ETH enviado diferente do valor exigido
    error ValorIncorreto(uint256 enviado, uint256 esperado);
    /// @notice Saque maior que o saldo disponível
    error SaldoInsuficiente(uint256 disponivel, uint256 solicitado);
    /// @notice Equipamento não está disponível para a operação
    error EquipamentoIndisponivel(uint256 id, StatusEquipamento status);
    /// @notice Id inexistente
    error RegistroInexistente(uint256 id);
    /// @notice Parâmetro inválido (campo identificado em bytes32)
    error ParametroInvalido(bytes32 campo);
    /// @notice Ação fora da janela de tempo permitida
    error PrazoInvalido(uint256 agora, uint256 limite);

    // =====================================================================
    // [Recurso: Modificadores]
    // =====================================================================

    /// @notice Restringe a função ao dono da plataforma (controle de acesso)
    modifier apenasDono() {
        if (msg.sender != DONO) revert NaoAutorizado(msg.sender);
        _;
    }

    /// @notice Exige que o equipamento exista
    /// @param id Id do equipamento
    modifier equipamentoExiste(uint256 id) {
        if (id >= _equipamentos.length) revert RegistroInexistente(id);
        _;
    }

    /// @notice Exige que o aluguel exista
    /// @param id Id do aluguel
    modifier aluguelExiste(uint256 id) {
        if (id >= totalAlugueis) revert RegistroInexistente(id);
        _;
    }

    /// @notice Exige que o aluguel esteja em um estado específico (modificador com parâmetros)
    /// @param aluguelId Id do aluguel
    /// @param esperado Estado exigido
    modifier noEstado(uint256 aluguelId, StatusAluguel esperado) {
        StatusAluguel atual = _alugueis[aluguelId].status;
        if (atual != esperado) revert EstadoInvalido(atual, esperado);
        _;
    }

    /// @notice Bloqueia chamadas reentrantes
    modifier semReentrada() {
        require(!_travado, "Reentrada bloqueada");
        _travado = true;
        _;
        _travado = false;
    }

    // =====================================================================
    // [Recurso: Funcoes] constructor
    // =====================================================================

    /// @param duracaoDia Segundos em um "dia" (use 86400; valores menores servem para demonstrar prazos ao vivo)
    /// @param taxaInicialBps Taxa da plataforma em basis points (ex.: 200 = 2%)
    constructor(uint256 duracaoDia, uint256 taxaInicialBps) {
        require(duracaoDia > 0, "Duracao do dia invalida");
        require(taxaInicialBps <= TAXA_MAXIMA_BPS, "Taxa acima do maximo");
        DONO = payable(msg.sender);
        DURACAO_DIA = duracaoDia;
        taxaBps = taxaInicialBps;
    }

    // =====================================================================
    // Funções de negócio (external)
    // =====================================================================

    /// @notice Cadastra um equipamento para aluguel. Quem chama passa a ser o locador.
    /// @param nome Nome do equipamento (1 a 64 bytes)
    /// @param categoria Categoria em bytes32 (ex.: "CAMERA"); usada nos filtros
    /// @param precoPorDia Preço da diária em wei (> 0)
    /// @param caucao Caução em wei (> 0), devolvida se tudo correr bem
    /// @return id Id do novo equipamento
    function cadastrarEquipamento(
        string calldata nome,
        bytes32 categoria,
        uint256 precoPorDia,
        uint256 caucao
    ) external returns (uint256 id) {
        {
            uint256 tam = bytes(nome).length;
            require(tam > 0 && tam <= 64, "Nome deve ter 1 a 64 bytes");
        }
        if (precoPorDia == 0) revert ParametroInvalido("precoPorDia");
        if (caucao == 0) revert ParametroInvalido("caucao");

        id = _equipamentos.length;
        Equipamento storage e = _equipamentos.push();
        e.id = id;
        e.nome = nome;
        e.categoria = categoria;
        e.precoPorDia = precoPorDia;
        e.caucao = caucao;
        e.locador = payable(msg.sender);
        e.status = StatusEquipamento.Disponivel;

        emit EquipamentoCadastrado(id, msg.sender, categoria, nome, precoPorDia, caucao);
    }

    /// @notice Ativa ou desativa um equipamento no catálogo (somente o locador, e não durante um aluguel)
    /// @param id Id do equipamento
    /// @param ativo true = Disponivel, false = Inativo
    function alterarDisponibilidade(uint256 id, bool ativo) external equipamentoExiste(id) {
        Equipamento storage e = _equipamentos[id];
        if (msg.sender != e.locador) revert NaoAutorizado(msg.sender);
        if (e.status == StatusEquipamento.Alugado) revert EquipamentoIndisponivel(id, e.status);

        e.status = ativo ? StatusEquipamento.Disponivel : StatusEquipamento.Inativo;
        emit DisponibilidadeAlterada(id, e.status);
    }

    /// @notice O locador bloqueia (ou desbloqueia) um endereço de alugar um de seus equipamentos
    /// @param equipamentoId Id do equipamento
    /// @param locatario Endereço a bloquear/desbloquear
    /// @param bloquear true para bloquear
    function bloquearLocatario(
        uint256 equipamentoId,
        address locatario,
        bool bloquear
    ) external equipamentoExiste(equipamentoId) {
        if (msg.sender != _equipamentos[equipamentoId].locador) revert NaoAutorizado(msg.sender);
        bloqueados[equipamentoId][locatario] = bloquear;
        emit LocatarioBloqueioAlterado(equipamentoId, locatario, bloquear);
    }

    /// @notice Aluga um equipamento. Deve-se enviar EXATAMENTE (preço * dias) + caução em ETH.
    /// @param equipamentoId Id do equipamento
    /// @param dias Quantidade de dias (1 a MAX_DIAS_ALUGUEL)
    /// @return aluguelId Id do aluguel criado
    function alugar(
        uint256 equipamentoId,
        uint256 dias
    ) external payable equipamentoExiste(equipamentoId) returns (uint256 aluguelId) {
        // [Recurso: EstruturasDeControle] validações com if/revert
        if (dias == 0 || dias > MAX_DIAS_ALUGUEL) revert ParametroInvalido("dias");

        Equipamento storage e = _equipamentos[equipamentoId];
        if (e.status != StatusEquipamento.Disponivel) revert EquipamentoIndisponivel(equipamentoId, e.status);
        if (msg.sender == e.locador || bloqueados[equipamentoId][msg.sender]) revert NaoAutorizado(msg.sender);

        uint256 precoTotal = e.precoPorDia * dias;
        uint256 esperado = precoTotal + e.caucao;
        if (msg.value != esperado) revert ValorIncorreto(msg.value, esperado);

        // Efeitos (estado) — não há chamada externa nesta função
        e.status = StatusEquipamento.Alugado;
        aluguelId = totalAlugueis++;

        Aluguel storage a = _alugueis[aluguelId];
        a.id = aluguelId;
        a.equipamentoId = equipamentoId;
        a.locador = e.locador;
        a.locatario = payable(msg.sender);
        a.dias = dias;
        a.inicio = block.timestamp;
        a.fim = block.timestamp + dias * DURACAO_DIA;
        a.precoTotal = precoTotal;
        a.caucao = e.caucao;
        a.taxaBps = taxaBps;
        a.status = StatusAluguel.Ativo;

        _alugueisDoLocatario[msg.sender].push(aluguelId);
        _alugueisDoLocador[e.locador].push(aluguelId);

        emit EquipamentoAlugado(aluguelId, equipamentoId, msg.sender, dias, msg.value);
    }

    /// @notice O locatário informa que devolveu o equipamento. Atrasos geram multa descontada da caução.
    /// @param aluguelId Id do aluguel
    function devolver(
        uint256 aluguelId
    ) external aluguelExiste(aluguelId) noEstado(aluguelId, StatusAluguel.Ativo) {
        Aluguel storage a = _alugueis[aluguelId];
        if (msg.sender != a.locatario) revert NaoAutorizado(msg.sender);

        a.devolvidoEm = block.timestamp;
        a.status = StatusAluguel.Devolvido;

        emit EquipamentoDevolvido(aluguelId, msg.sender, calcularMulta(aluguelId));
    }

    /// @notice O locador confirma que recebeu o equipamento em bom estado; valores são liberados para saque.
    /// @param aluguelId Id do aluguel
    function confirmarRecebimento(
        uint256 aluguelId
    ) external aluguelExiste(aluguelId) noEstado(aluguelId, StatusAluguel.Devolvido) {
        if (msg.sender != _alugueis[aluguelId].locador) revert NaoAutorizado(msg.sender);
        _finalizarDevolucao(aluguelId);
    }

    /// @notice Se o locador não confirmar nem contestar em DIAS_PRAZO_CONFIRMACAO, o locatário libera o aluguel.
    /// @param aluguelId Id do aluguel
    function liberarPorTimeout(
        uint256 aluguelId
    ) external aluguelExiste(aluguelId) noEstado(aluguelId, StatusAluguel.Devolvido) {
        Aluguel storage a = _alugueis[aluguelId];
        if (msg.sender != a.locatario) revert NaoAutorizado(msg.sender);

        uint256 limite = a.devolvidoEm + DIAS_PRAZO_CONFIRMACAO * DURACAO_DIA;
        if (block.timestamp <= limite) revert PrazoInvalido(block.timestamp, limite);

        _finalizarDevolucao(aluguelId);
    }

    /// @notice O locador contesta a devolução (ex.: equipamento danificado) dentro do prazo de confirmação.
    /// @param aluguelId Id do aluguel
    function abrirDisputa(
        uint256 aluguelId
    ) external aluguelExiste(aluguelId) noEstado(aluguelId, StatusAluguel.Devolvido) {
        Aluguel storage a = _alugueis[aluguelId];
        if (msg.sender != a.locador) revert NaoAutorizado(msg.sender);

        uint256 limite = a.devolvidoEm + DIAS_PRAZO_CONFIRMACAO * DURACAO_DIA;
        if (block.timestamp > limite) revert PrazoInvalido(block.timestamp, limite);

        a.status = StatusAluguel.EmDisputa;
        emit DisputaAberta(aluguelId, msg.sender);
    }

    /// @notice O dono arbitra a disputa, definindo quanto da caução vai ao locador (o resto volta ao locatário).
    /// @dev O dono não pode arbitrar um aluguel em que ele próprio é parte.
    /// @param aluguelId Id do aluguel
    /// @param caucaoParaLocador Valor (em wei) da caução destinado ao locador, de 0 até a caução total
    function resolverDisputa(
        uint256 aluguelId,
        uint256 caucaoParaLocador
    ) external apenasDono aluguelExiste(aluguelId) noEstado(aluguelId, StatusAluguel.EmDisputa) {
        Aluguel storage a = _alugueis[aluguelId];
        if (msg.sender == a.locador || msg.sender == a.locatario) revert NaoAutorizado(msg.sender);
        require(caucaoParaLocador <= a.caucao, "Valor acima da caucao");

        a.status = StatusAluguel.Resolvido;
        _equipamentos[a.equipamentoId].status = StatusEquipamento.Disponivel;

        // [Recurso: EstruturasDeControle] if / else if / else
        if (caucaoParaLocador == 0) {
            _ajustarReputacao(a.locador, -1); // contestação sem fundamento
        } else if (caucaoParaLocador == a.caucao) {
            _ajustarReputacao(a.locatario, -2); // dano total
        } else {
            _ajustarReputacao(a.locatario, -1); // dano parcial
        }

        _liquidar(aluguelId, caucaoParaLocador);
        emit DisputaResolvida(aluguelId, msg.sender, caucaoParaLocador);
    }

    /// @notice Se o locatário some (passou DIAS_PRAZO_ABANDONO após o fim), o locador fica com preço + caução.
    /// @param aluguelId Id do aluguel
    function reivindicarPorAtraso(
        uint256 aluguelId
    ) external aluguelExiste(aluguelId) noEstado(aluguelId, StatusAluguel.Ativo) {
        Aluguel storage a = _alugueis[aluguelId];
        if (msg.sender != a.locador) revert NaoAutorizado(msg.sender);

        uint256 limite = a.fim + DIAS_PRAZO_ABANDONO * DURACAO_DIA;
        if (block.timestamp <= limite) revert PrazoInvalido(block.timestamp, limite);

        a.status = StatusAluguel.Concluido;
        _equipamentos[a.equipamentoId].status = StatusEquipamento.Inativo; // equipamento não voltou
        _ajustarReputacao(a.locatario, -3);

        _liquidar(aluguelId, a.caucao);
        emit CaucaoReivindicada(aluguelId, msg.sender, a.caucao);
    }

    /// @notice Saca ETH do saldo da conta (padrão pull payment + checks-effects-interactions).
    /// @param valor Valor em wei a sacar
    function sacar(uint256 valor) external semReentrada {
        // Checks
        uint256 disponivel = saldos[msg.sender];
        if (valor == 0) revert ParametroInvalido("valor");
        if (valor > disponivel) revert SaldoInsuficiente(disponivel, valor);

        // Effects
        saldos[msg.sender] = disponivel - valor;
        emit SaqueRealizado(msg.sender, valor);

        // Interactions
        (bool ok, ) = payable(msg.sender).call{value: valor}("");
        require(ok, "Falha ao transferir ETH");
    }

    /// @notice O dono altera a taxa da plataforma (vale apenas para aluguéis futuros).
    /// @param novaTaxaBps Nova taxa em basis points (máx. TAXA_MAXIMA_BPS)
    function definirTaxa(uint256 novaTaxaBps) external apenasDono {
        require(novaTaxaBps <= TAXA_MAXIMA_BPS, "Taxa acima do maximo");
        emit TaxaAlterada(taxaBps, novaTaxaBps);
        taxaBps = novaTaxaBps;
    }

    // =====================================================================
    // Consultas (view / pure)
    // =====================================================================

    /// @notice Quantidade de equipamentos cadastrados
    function totalEquipamentos() external view returns (uint256) {
        return _equipamentos.length;
    }

    /// @notice Dados de um equipamento
    /// @param id Id do equipamento
    function obterEquipamento(
        uint256 id
    ) external view equipamentoExiste(id) returns (Equipamento memory) {
        return _equipamentos[id];
    }

    /// @notice Dados de um aluguel
    /// @param aluguelId Id do aluguel
    function obterAluguel(
        uint256 aluguelId
    ) external view aluguelExiste(aluguelId) returns (Aluguel memory) {
        return _alugueis[aluguelId];
    }

    /// @notice Ids dos aluguéis em que a conta é locatária
    /// @param conta Endereço consultado
    function alugueisDoLocatario(address conta) external view returns (uint256[] memory) {
        return _alugueisDoLocatario[conta];
    }

    /// @notice Ids dos aluguéis em que a conta é locadora
    /// @param conta Endereço consultado
    function alugueisDoLocador(address conta) external view returns (uint256[] memory) {
        return _alugueisDoLocador[conta];
    }

    /// @notice Valor exato (em wei) que deve ser enviado em `alugar`
    /// @param equipamentoId Id do equipamento
    /// @param dias Quantidade de dias
    function custoTotal(
        uint256 equipamentoId,
        uint256 dias
    ) external view equipamentoExiste(equipamentoId) returns (uint256) {
        Equipamento storage e = _equipamentos[equipamentoId];
        return e.precoPorDia * dias + e.caucao;
    }

    /// @notice Lista equipamentos de forma paginada, com filtro opcional.
    /// @dev [Recurso: EstruturasDeControle] laço `for` com limite controlado (MAX_POR_PAGINA).
    /// @param categoria Filtra por categoria; bytes32(0) = todas
    /// @param apenasDisponiveis Se true, só retorna equipamentos Disponivel
    /// @param inicio Índice inicial da janela de busca
    /// @param limite Tamanho da janela (1 a MAX_POR_PAGINA)
    /// @return resultado Equipamentos encontrados na janela
    /// @return proximo Índice para continuar a paginação (se proximo < totalEquipamentos())
    function listarEquipamentos(
        bytes32 categoria,
        bool apenasDisponiveis,
        uint256 inicio,
        uint256 limite
    ) external view returns (Equipamento[] memory resultado, uint256 proximo) {
        if (limite == 0 || limite > MAX_POR_PAGINA) revert ParametroInvalido("limite");

        uint256 total = _equipamentos.length;
        uint256 fim = inicio + limite;
        if (fim > total) fim = total;

        uint256 n;
        for (uint256 i = inicio; i < fim; ++i) {
            if (_corresponde(_equipamentos[i], categoria, apenasDisponiveis)) ++n;
        }

        resultado = new Equipamento[](n);
        uint256 k;
        for (uint256 i = inicio; i < fim; ++i) {
            if (_corresponde(_equipamentos[i], categoria, apenasDisponiveis)) {
                resultado[k] = _equipamentos[i];
                ++k;
            }
        }
        proximo = fim;
    }

    /// @notice Multa por atraso (em wei): 1 diária por dia (ou fração) de atraso, limitada à caução.
    /// @dev Usa o momento da devolução; se ainda não devolvido, usa o momento atual (prévia para o frontend).
    /// @param aluguelId Id do aluguel
    function calcularMulta(uint256 aluguelId) public view aluguelExiste(aluguelId) returns (uint256 multa) {
        Aluguel storage a = _alugueis[aluguelId];
        uint256 referencia = a.devolvidoEm != 0 ? a.devolvidoEm : block.timestamp;
        if (referencia <= a.fim) return 0;

        uint256 diasAtraso = (referencia - a.fim + DURACAO_DIA - 1) / DURACAO_DIA; // arredonda para cima
        multa = diasAtraso * (a.precoTotal / a.dias);
        if (multa > a.caucao) multa = a.caucao;
    }

    /// @notice Calcula a taxa da plataforma sobre um valor
    /// @param valor Valor base em wei
    /// @param bps Taxa em basis points
    function calcularTaxa(uint256 valor, uint256 bps) public pure returns (uint256) {
        return (valor * bps) / BPS_BASE;
    }

    // =====================================================================
    // Funções internas e privadas
    // =====================================================================

    /// @dev Conclui uma devolução normal: multa (se houver) vai ao locador e o restante da caução ao locatário.
    function _finalizarDevolucao(uint256 aluguelId) internal {
        Aluguel storage a = _alugueis[aluguelId];
        uint256 multa = calcularMulta(aluguelId);

        a.status = StatusAluguel.Concluido;
        _equipamentos[a.equipamentoId].status = StatusEquipamento.Disponivel;

        if (multa == 0) {
            _ajustarReputacao(a.locatario, 1);
        } else {
            _ajustarReputacao(a.locatario, -1);
        }

        _liquidar(aluguelId, multa);
        emit AluguelConcluido(aluguelId, a.locador, a.locatario, multa);
    }

    /// @dev Credita os saldos. Invariante: taxa + (preco - taxa) + parteLocador + (caucao - parteLocador) = preco + caucao.
    function _liquidar(uint256 aluguelId, uint256 caucaoParaLocador) internal {
        Aluguel storage a = _alugueis[aluguelId];
        uint256 taxa = calcularTaxa(a.precoTotal, a.taxaBps);

        saldos[a.locador] += (a.precoTotal - taxa) + caucaoParaLocador;
        saldos[a.locatario] += a.caucao - caucaoParaLocador;
        saldos[DONO] += taxa;
    }

    /// @dev Filtro usado por listarEquipamentos
    function _corresponde(
        Equipamento storage e,
        bytes32 categoria,
        bool apenasDisponiveis
    ) private view returns (bool) {
        if (apenasDisponiveis && e.status != StatusEquipamento.Disponivel) return false;
        return categoria == bytes32(0) || e.categoria == categoria;
    }

    /// @dev Soma (ou subtrai) pontos de reputação
    function _ajustarReputacao(address conta, int256 delta) private {
        reputacao[conta] += delta;
    }
}
