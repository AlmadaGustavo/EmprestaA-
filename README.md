# EmprestaAÍ — dApp de aluguel de equipamentos

Aplicação descentralizada para anunciar e alugar equipamentos na Ethereum Sepolia. O contrato mantém o pagamento e a caução em custódia, registra o ciclo do aluguel na blockchain e distribui os valores conforme a devolução, confirmação, atraso ou resolução de disputa.

> **Rede de demonstração:** Ethereum Sepolia. Use somente SepoliaETH de faucet. Este projeto é acadêmico e não deve receber ETH real.

## 1. Integrantes e responsabilidades

| Integrante | Responsabilidade |
|---|---|
| `[Gustavo Almada]` | `[Contrato Solidity / testes/ Integração Web3 / MetaMask]` |
| `[Leonardo Melo]` | `[Frontend / interface/ Documentação / QA / apresentação]` |
> Preencher os nomes e os papéis reais da equipe antes da entrega.


## 2. Deploy na Sepolia

- **Contrato:** `AluguelEquipamentos`
- **Endereço:** `0x9c37F732057a68BB7892c6B0EeD65ba762f70a54`
- **Rede:** Ethereum Sepolia
- **Chain ID:** `11155111` (`0xaa36a7`)
- **Código no Etherscan:** [Abrir contrato na Sepolia](https://sepolia.etherscan.io/address/0x9c37F732057a68BB7892c6B0EeD65ba762f70a54#code)
- **Hash da transação de deploy:** `0x4b485095ef158d0add1f7790f9bd814807464d153e4209925ee8d61ae7516ab4`
- **Bloco do deploy:** `12145310`
- **Status da transação:** `Success`
- **Verificação do código:** Concluída com sucesso no Etherscan.
- **Bloco inicial para leitura de eventos:** `12145310`


## 3. Problema e solução

O projeto propõe um meio transparente de intermediar o aluguel de equipamentos entre locadores e locatários. O contrato registra os equipamentos e os aluguéis, recebe o preço e a caução em ETH de teste e controla a liberação dos valores de acordo com o estado da operação. O modelo de saque por saldo (`pull payment`) evita transferir ETH diretamente durante as principais mudanças de estado.

## 4. Funcionalidades

### Contrato

- Cadastro de equipamentos com nome, categoria, preço diário e caução.
- Ativação e desativação de anúncios pelo respectivo locador.
- Bloqueio de locatários por equipamento pelo respectivo locador.
- Aluguel com envio obrigatório do valor exato calculado pelo contrato.
- Devolução, confirmação de recebimento, multa por atraso e reivindicação por abandono.
- Abertura e resolução de disputas pelo dono da plataforma.
- Saldo interno por endereço e saque individual.
- Alteração da taxa da plataforma pelo dono, limitada a 10% e aplicada a novos aluguéis.

### Frontend

- Conexão MetaMask, exibição do endereço, saldo em ETH da carteira e reputação.
- Verificação da Sepolia e opção para solicitar a troca de rede.
- Catálogo com filtro por categoria, disponibilidade e paginação.
- Cadastro, aluguel e gerenciamento dos próprios equipamentos.
- Consulta de aluguéis e ações disponíveis conforme o estado e o papel da conta.
- Consulta do saldo mantido no contrato e saque.
- Histórico de eventos da blockchain com links para as transações no Sepolia Etherscan.
- Feedback de transações com estado pendente, confirmada ou falhou.
- Painel administrativo exibido somente para o endereço `DONO`, com alteração de taxa e resolução de disputas.

## 5. Recursos de Solidity exigidos no guia

| Grupo | Onde aparece | Justificativa |
|---|---|---|
| `TiposDeDados` | `contracts/AluguelEquipamentos.sol`, seção a partir da linha 62 | Usa inteiros, booleanos, endereços, `string`, `bytes32`, `constant` e `immutable` para representar participantes, valores e parâmetros. |
| `Funcoes` | Construtor na linha 210 e funções de negócio a partir da linha 228 | Separa cadastro, aluguel, devolução, saque, administração e consultas; usa visibilidades e mutabilidades adequadas. |
| `EstruturasDeControle` | Validações em `alugar` (linha 288) e resolução de disputa (linha 389), além de paginação em `listarEquipamentos` (linha 502) | Valida condições, controla estados e percorre resultados com limite de página. |
| `ArraysEMappings` | Seção a partir da linha 91 | Mantém o catálogo, registros, saldos, reputação, bloqueios e índices de aluguéis por usuário. |
| `StructsEEnums` | Seção a partir da linha 12 | Modela equipamentos e aluguéis com structs e estados explícitos para cada ciclo de vida. |
| `Modificadores` | Seção a partir da linha 164 | Centraliza controle de acesso, existência de registros, estado esperado e proteção contra reentrância. |
| `EventosEErros` | Seção a partir da linha 113 | Emite eventos para rastreabilidade e usa erros personalizados para falhas de negócio. |

As linhas são referências iniciais; podem mudar se o contrato for editado. Os marcadores `// [Recurso: ...]` estão no próprio código-fonte.

## 6. Funções principais do contrato

| Função | Quem pode chamar | Finalidade |
|---|---|---|
| `cadastrarEquipamento` | Qualquer carteira | Publica um equipamento para aluguel. |
| `alterarDisponibilidade` | Locador do equipamento | Ativa ou desativa o anúncio, respeitando o estado do item. |
| `bloquearLocatario` | Locador do equipamento | Impede ou permite que um endereço alugue aquele equipamento. |
| `alugar` | Carteira elegível, exceto o próprio locador | Cria o aluguel e recebe o valor exato em ETH. |
| `devolver` | Locatário | Registra a devolução e calcula eventual multa. |
| `confirmarRecebimento` | Locador | Finaliza o aluguel após receber o equipamento. |
| `abrirDisputa` | Locador | Contesta a devolução dentro do prazo previsto. |
| `resolverDisputa` | Dono da plataforma | Define a parcela da caução destinada ao locador. |
| `liberarPorTimeout` | Locatário | Libera o aluguel quando o locador não age no prazo. |
| `reivindicarPorAtraso` | Locador | Trata abandono após o prazo de atraso. |
| `sacar` | Titular do saldo | Retira ETH creditado ao próprio endereço. |
| `definirTaxa` | Dono da plataforma | Altera a taxa para novos aluguéis, até 1000 bps (10%). |

### Eventos emitidos

`EquipamentoCadastrado`, `DisponibilidadeAlterada`, `LocatarioBloqueioAlterado`, `EquipamentoAlugado`, `EquipamentoDevolvido`, `AluguelConcluido`, `DisputaAberta`, `DisputaResolvida`, `CaucaoReivindicada`, `SaqueRealizado` e `TaxaAlterada`.

### Erros personalizados

`NaoAutorizado`, `EstadoInvalido`, `ValorIncorreto`, `SaldoInsuficiente`, `EquipamentoIndisponivel`, `RegistroInexistente`, `ParametroInvalido` e `PrazoInvalido`. Algumas validações complementares usam `require` com mensagens explicativas.

## 7. Executar localmente

1. Instale uma versão atual do Node.js.
2. Abra um terminal na pasta do projeto e instale as dependências de desenvolvimento:

   ```bash
   npm install
   ```

3. Execute os testes automatizados do contrato:

   ```bash
   npm test
   ```

4. Inicie um servidor estático na pasta do frontend:

   ```bash
   cd frontend
   python -m http.server 5500
   ```

5. Abra `http://localhost:5500` no navegador com a extensão MetaMask instalada.
6. Configure a MetaMask na Sepolia, conecte uma carteira com SepoliaETH e teste as funcionalidades.

Não abra o `index.html` diretamente pelo sistema de arquivos (`file://`); use um servidor HTTP local.

## 8. Publicação na Vercel

A hospedagem pública na Vercel é requisito do trabalho.

1. Envie o repositório público ao GitHub.
2. Na Vercel, importe o repositório.
3. Configure **Root Directory** como `frontend`.
4. Selecione **Other** como framework. Como o frontend é estático, não é necessário comando de build; use `.` como diretório de saída, se solicitado.
5. Publique e teste a URL HTTPS com a MetaMask na Sepolia.

- **URL pública da dApp:** `[PREENCHER APÓS O DEPLOY NA VERCEL]`

## 9. Roteiro de demonstração e testes

1. Conectar a carteira do locador e cadastrar um equipamento.
2. Conferir o anúncio no catálogo e o evento de cadastro.
3. Conectar uma segunda carteira (locatário), localizar o equipamento e simular o valor.
4. Alugar enviando o valor exato indicado pelo contrato; mostrar a solicitação na MetaMask, o hash e a confirmação no Etherscan.
5. Mostrar o aluguel nas telas das carteiras envolvidas.
6. Realizar a devolução e confirmar o recebimento; demonstrar o saldo creditado e o saque.
7. Conectar a carteira do dono, alterar a taxa e, se houver uma disputa preparada, demonstrar sua resolução.
8. Provocar uma validação (por exemplo, tentar uma ação com conta sem permissão) e mostrar a mensagem amigável.

- **Vídeo de demonstração (3 a 5 minutos):** `[INSERIR LINK]`
- **Slides em PDF:** `docs/slides.pdf` `[ADICIONAR ARQUIVO]`
- **Capturas de tela:** adicionar em `docs/prints/`.

## 10. Limitações conhecidas e melhorias futuras

- A aplicação depende da MetaMask, da disponibilidade da Sepolia e de ETH de teste para transações.
- O histórico é consultado pelo frontend via `getPastEvents`; provedores RPC podem impor limites de intervalo ou volume de logs.
- A interface é um protótipo acadêmico e não substitui auditoria de segurança antes de qualquer uso com ativos reais.
- Melhorias possíveis: paginação do histórico, indexação de eventos, notificações em tempo real e testes adicionais de usabilidade.

## 11. Uso de ferramentas de IA

`[DESCREVER COM TRANSPARÊNCIA SE E COMO FERRAMENTAS DE IA FORAM UTILIZADAS: revisão de código, sugestões de interface, documentação, testes etc.]`

## 12. Estrutura do repositório

```text
EmprestaA-/
├── contracts/
│   └── AluguelEquipamentos.sol
├── docs/
│   ├── INTEGRACAO_FRONTEND.md
│   ├── README_BACKEND.md
│   ├── slides.pdf              # adicionar
│   └── prints/                 # adicionar capturas
├── frontend/
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   └── contrato.js             # ABI + endereço Sepolia
├── test/
│   └── teste-contrato.js
└── README.md
```
