// Gerado a partir do contrato compilado. NÃO edite o ABI à mão.
// Depois do deploy na Sepolia, troque ENDERECO_CONTRATO pelo endereço real.
const ENDERECO_CONTRATO = "0xCOLE_AQUI_O_ENDERECO_DO_CONTRATO";
const CHAIN_ID_SEPOLIA = 11155111; // 0xaa36a7
const ABI = [
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "duracaoDia",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "taxaInicialBps",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "internalType": "enum AluguelEquipamentos.StatusEquipamento",
        "name": "status",
        "type": "uint8"
      }
    ],
    "name": "EquipamentoIndisponivel",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "enum AluguelEquipamentos.StatusAluguel",
        "name": "atual",
        "type": "uint8"
      },
      {
        "internalType": "enum AluguelEquipamentos.StatusAluguel",
        "name": "esperado",
        "type": "uint8"
      }
    ],
    "name": "EstadoInvalido",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "chamador",
        "type": "address"
      }
    ],
    "name": "NaoAutorizado",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "campo",
        "type": "bytes32"
      }
    ],
    "name": "ParametroInvalido",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "agora",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "limite",
        "type": "uint256"
      }
    ],
    "name": "PrazoInvalido",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "RegistroInexistente",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "disponivel",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "solicitado",
        "type": "uint256"
      }
    ],
    "name": "SaldoInsuficiente",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "enviado",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "esperado",
        "type": "uint256"
      }
    ],
    "name": "ValorIncorreto",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "aluguelId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "locador",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "locatario",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "multa",
        "type": "uint256"
      }
    ],
    "name": "AluguelConcluido",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "aluguelId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "locador",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "valor",
        "type": "uint256"
      }
    ],
    "name": "CaucaoReivindicada",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "enum AluguelEquipamentos.StatusEquipamento",
        "name": "status",
        "type": "uint8"
      }
    ],
    "name": "DisponibilidadeAlterada",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "aluguelId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "locador",
        "type": "address"
      }
    ],
    "name": "DisputaAberta",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "aluguelId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "arbitro",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "caucaoParaLocador",
        "type": "uint256"
      }
    ],
    "name": "DisputaResolvida",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "aluguelId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "equipamentoId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "locatario",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "dias",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "valorPago",
        "type": "uint256"
      }
    ],
    "name": "EquipamentoAlugado",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "locador",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "categoria",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "nome",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "precoPorDia",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "caucao",
        "type": "uint256"
      }
    ],
    "name": "EquipamentoCadastrado",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "aluguelId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "locatario",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "multa",
        "type": "uint256"
      }
    ],
    "name": "EquipamentoDevolvido",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "equipamentoId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "locatario",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "bool",
        "name": "bloqueado",
        "type": "bool"
      }
    ],
    "name": "LocatarioBloqueioAlterado",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "conta",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "valor",
        "type": "uint256"
      }
    ],
    "name": "SaqueRealizado",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "taxaAntiga",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "taxaNova",
        "type": "uint256"
      }
    ],
    "name": "TaxaAlterada",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "BPS_BASE",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "DIAS_PRAZO_ABANDONO",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "DIAS_PRAZO_CONFIRMACAO",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "DONO",
    "outputs": [
      {
        "internalType": "address payable",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "DURACAO_DIA",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "MAX_DIAS_ALUGUEL",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "MAX_POR_PAGINA",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "NOME",
    "outputs": [
      {
        "internalType": "string",
        "name": "",
        "type": "string"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "TAXA_MAXIMA_BPS",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "aluguelId",
        "type": "uint256"
      }
    ],
    "name": "abrirDisputa",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "ativo",
        "type": "bool"
      }
    ],
    "name": "alterarDisponibilidade",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "equipamentoId",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "dias",
        "type": "uint256"
      }
    ],
    "name": "alugar",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "aluguelId",
        "type": "uint256"
      }
    ],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "conta",
        "type": "address"
      }
    ],
    "name": "alugueisDoLocador",
    "outputs": [
      {
        "internalType": "uint256[]",
        "name": "",
        "type": "uint256[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "conta",
        "type": "address"
      }
    ],
    "name": "alugueisDoLocatario",
    "outputs": [
      {
        "internalType": "uint256[]",
        "name": "",
        "type": "uint256[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "bloqueados",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "equipamentoId",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "locatario",
        "type": "address"
      },
      {
        "internalType": "bool",
        "name": "bloquear",
        "type": "bool"
      }
    ],
    "name": "bloquearLocatario",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "nome",
        "type": "string"
      },
      {
        "internalType": "bytes32",
        "name": "categoria",
        "type": "bytes32"
      },
      {
        "internalType": "uint256",
        "name": "precoPorDia",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "caucao",
        "type": "uint256"
      }
    ],
    "name": "cadastrarEquipamento",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "aluguelId",
        "type": "uint256"
      }
    ],
    "name": "calcularMulta",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "multa",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "valor",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "bps",
        "type": "uint256"
      }
    ],
    "name": "calcularTaxa",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "pure",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "aluguelId",
        "type": "uint256"
      }
    ],
    "name": "confirmarRecebimento",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "equipamentoId",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "dias",
        "type": "uint256"
      }
    ],
    "name": "custoTotal",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "novaTaxaBps",
        "type": "uint256"
      }
    ],
    "name": "definirTaxa",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "aluguelId",
        "type": "uint256"
      }
    ],
    "name": "devolver",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "aluguelId",
        "type": "uint256"
      }
    ],
    "name": "liberarPorTimeout",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "categoria",
        "type": "bytes32"
      },
      {
        "internalType": "bool",
        "name": "apenasDisponiveis",
        "type": "bool"
      },
      {
        "internalType": "uint256",
        "name": "inicio",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "limite",
        "type": "uint256"
      }
    ],
    "name": "listarEquipamentos",
    "outputs": [
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "id",
            "type": "uint256"
          },
          {
            "internalType": "string",
            "name": "nome",
            "type": "string"
          },
          {
            "internalType": "bytes32",
            "name": "categoria",
            "type": "bytes32"
          },
          {
            "internalType": "uint256",
            "name": "precoPorDia",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "caucao",
            "type": "uint256"
          },
          {
            "internalType": "address payable",
            "name": "locador",
            "type": "address"
          },
          {
            "internalType": "enum AluguelEquipamentos.StatusEquipamento",
            "name": "status",
            "type": "uint8"
          }
        ],
        "internalType": "struct AluguelEquipamentos.Equipamento[]",
        "name": "resultado",
        "type": "tuple[]"
      },
      {
        "internalType": "uint256",
        "name": "proximo",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "aluguelId",
        "type": "uint256"
      }
    ],
    "name": "obterAluguel",
    "outputs": [
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "id",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "equipamentoId",
            "type": "uint256"
          },
          {
            "internalType": "address payable",
            "name": "locador",
            "type": "address"
          },
          {
            "internalType": "address payable",
            "name": "locatario",
            "type": "address"
          },
          {
            "internalType": "uint256",
            "name": "dias",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "inicio",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "fim",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "devolvidoEm",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "precoTotal",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "caucao",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "taxaBps",
            "type": "uint256"
          },
          {
            "internalType": "enum AluguelEquipamentos.StatusAluguel",
            "name": "status",
            "type": "uint8"
          }
        ],
        "internalType": "struct AluguelEquipamentos.Aluguel",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "obterEquipamento",
    "outputs": [
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "id",
            "type": "uint256"
          },
          {
            "internalType": "string",
            "name": "nome",
            "type": "string"
          },
          {
            "internalType": "bytes32",
            "name": "categoria",
            "type": "bytes32"
          },
          {
            "internalType": "uint256",
            "name": "precoPorDia",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "caucao",
            "type": "uint256"
          },
          {
            "internalType": "address payable",
            "name": "locador",
            "type": "address"
          },
          {
            "internalType": "enum AluguelEquipamentos.StatusEquipamento",
            "name": "status",
            "type": "uint8"
          }
        ],
        "internalType": "struct AluguelEquipamentos.Equipamento",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "aluguelId",
        "type": "uint256"
      }
    ],
    "name": "reivindicarPorAtraso",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "reputacao",
    "outputs": [
      {
        "internalType": "int256",
        "name": "",
        "type": "int256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "aluguelId",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "caucaoParaLocador",
        "type": "uint256"
      }
    ],
    "name": "resolverDisputa",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "valor",
        "type": "uint256"
      }
    ],
    "name": "sacar",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "saldos",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "taxaBps",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalAlugueis",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalEquipamentos",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];
