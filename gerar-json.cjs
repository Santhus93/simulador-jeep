// gerar-json.cjs
//
// Le a aba EXPORTACAO_WEB da planilha de politica comercial Jeep (.xlsm)
// e gera src/data/politica.json no formato usado pelo Simulador Comercial Jeep.
//
// Estrutura esperada da aba EXPORTACAO_WEB:
// A = DESCRICAO
// B = FAMILIA
// C = MY
// D = MVS
// E = PPS
// F = Margem
// G = COMBUSTIVEL
// H = PRECO
//
// A competencia e calculada automaticamente pelo mes corrente da execucao.
// Ex.: novembro/2026 -> NOVEMBRO/2026.
//
// Uso:
//   node gerar-json.cjs --teste
//   node gerar-json.cjs

const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

// ======================= CONFIGURACAO =======================
const ARQUIVO_EXCEL = "./POLITICA/POLITICA VENDAS ATUALIZADA JEEP.xlsm";
const NOME_ABA = "EXPORTACAO_WEB";
const LINHA_INICIO_DADOS = 2;
const ARQUIVO_SAIDA = "./src/data/politica.json";

const COLUNAS = {
  descricao: 0,   // A
  familia: 1,     // B
  my: 2,          // C
  mvs: 3,         // D
  pps: 4,         // E
  margem: 5,      // F
  combustivel: 6, // G
  preco: 7,       // H
};

const PULAR_MODELOS_COM_PPS_ZERO = false;
// ======================= FIM DA CONFIGURACAO =======================

const modoTeste = process.argv.includes("--teste");

function competenciaAtual() {
  const agora = new Date();
  const formatter = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });

  return formatter
    .format(agora)
    .replace(" de ", "/")
    .toUpperCase();
}

function limparTexto(valor) {
  if (valor === undefined || valor === null) return "";
  return String(valor).trim();
}

function numero(valor) {
  if (typeof valor === "number") {
    return Number.isFinite(valor) ? valor : 0;
  }

  const texto = limparTexto(valor);
  if (!texto || texto === "*" || /^N\/?D$/i.test(texto)) return 0;

  const semMoeda = texto.replace(/R\$/gi, "").replace(/\s/g, "");
  const normalizado = semMoeda.includes(",")
    ? semMoeda.replace(/\./g, "").replace(",", ".")
    : semMoeda;

  const n = Number(normalizado);
  return Number.isFinite(n) ? n : 0;
}

function numeroPolitica(valor) {
  if (valor === undefined || valor === null || valor === "") return null;

  if (typeof valor === "number") {
    return Number.isFinite(valor) && valor > 0 ? valor : null;
  }

  const texto = limparTexto(valor);
  if (
    !texto ||
    texto === "*" ||
    /^(N\/?D|N\/A|PENDENTE|NAO SE APLICA)$/i.test(texto)
  ) {
    return null;
  }

  const n = numero(texto);
  return n > 0 ? n : null;
}

function main() {
  const caminho = path.resolve(ARQUIVO_EXCEL);
  const mesReferencia = competenciaAtual();

  if (!fs.existsSync(caminho)) {
    console.error(`\nArquivo nao encontrado: ${caminho}`);
    console.error(
      "Confira ARQUIVO_EXCEL no topo do gerar-json.cjs e o nome do arquivo dentro da pasta POLITICA.\n"
    );
    process.exit(1);
  }

  const workbook = XLSX.readFile(caminho, { cellDates: false });

  if (!workbook.SheetNames.includes(NOME_ABA)) {
    console.error(`\nAba \"${NOME_ABA}\" nao encontrada.`);
    console.error("Abas disponiveis: " + workbook.SheetNames.join(", ") + "\n");
    process.exit(1);
  }

  const planilha = workbook.Sheets[NOME_ABA];
  const linhas = XLSX.utils.sheet_to_json(planilha, {
    header: 1,
    blankrows: false,
    defval: "",
    raw: true,
  });

  const modelos = [];
  const avisos = [];
  const pulados = [];

  for (let i = LINHA_INICIO_DADOS - 1; i < linhas.length; i++) {
    const linha = linhas[i];
    const modelo = limparTexto(linha[COLUNAS.descricao]);

    if (!modelo) continue;

    const familia = limparTexto(linha[COLUNAS.familia]);
    const pps = numero(linha[COLUNAS.pps]);

    if (PULAR_MODELOS_COM_PPS_ZERO && pps === 0) {
      pulados.push(`Linha ${i + 1}: ${modelo}`);
      continue;
    }

    const precoPolitica = numeroPolitica(linha[COLUNAS.preco]);

    if (!familia) {
      avisos.push(`Linha ${i + 1}: ${modelo} sem FAMILIA.`);
    }

    if (pps === 0) {
      avisos.push(`Linha ${i + 1}: ${modelo} com PPS zerado/ausente.`);
    }

    if (precoPolitica === null) {
      avisos.push(`Linha ${i + 1}: ${modelo} sem PRECO informado.`);
    }

    const item = {
      familia,
      modelo,
      anoModelo: limparTexto(linha[COLUNAS.my]),
      my: limparTexto(linha[COLUNAS.my]),
      mvs: limparTexto(linha[COLUNAS.mvs]),
      pps,
      margem: numero(linha[COLUNAS.margem]),
      lb: 0,
      bonus: 0,
      combustivel: limparTexto(linha[COLUNAS.combustivel]),
      precoPolitica,
      observacao: "",
      tipoAutorizacao: "REGIONAL",
    };

    modelos.push(item);

    if (modoTeste) {
      console.log(`\n--- Linha ${i + 1} da planilha ---`);
      console.dir(item, { depth: null });
    }
  }

  if (pulados.length) {
    console.log("\nModelos IGNORADOS por PPS = 0:");
    pulados.forEach((modelo) => console.log("  - " + modelo));
  }

  if (avisos.length) {
    console.log("\nAVISOS DA LEITURA:");
    avisos.forEach((aviso) => console.log("  - " + aviso));
  }

  console.log(`\nCompetencia: ${mesReferencia}`);
  console.log(`Total de modelos Jeep lidos: ${modelos.length}`);

  if (modoTeste) {
    console.log("MODO TESTE: nenhum arquivo foi gravado.");
    console.log("Se estiver correto, rode: node gerar-json.cjs\n");
    return;
  }

  const resultado = {
    marca: "JEEP",
    mesReferencia,
    modelos,
  };

  const destino = path.resolve(ARQUIVO_SAIDA);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, JSON.stringify(resultado, null, 2), "utf-8");

  console.log(`\nArquivo gerado: ${destino}`);
  console.log(`Total de modelos: ${modelos.length}`);
  console.log("O simulador Jeep utiliza: src/data/politica.json\n");
}

main();
