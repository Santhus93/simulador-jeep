const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

const ARQUIVO_EXCEL = "./POLITICA/POLITICA VENDAS ATUALIZADA JEEP.xlsm";
const NOME_ABA = "EXPORTACAO_WEB";
const MES_REFERENCIA = "NOVEMBRO/2026";
const LINHA_INICIO_DADOS = 2;
const ARQUIVO_SAIDA = "./src/data/politica.json";

const COLUNAS = { descricao:0, familia:1, my:2, mvs:3, pps:4, margem:5, comb:6, preco:7 };
const PULAR_MODELOS_COM_PPS_ZERO = false;
const modoTeste = process.argv.includes("--teste");

function limparTexto(valor) { return valor == null ? "" : String(valor).trim(); }
function numero(valor) {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;
  const texto = limparTexto(valor);
  if (!texto || texto === "*" || /^N\/?D$/i.test(texto)) return 0;
  const semMoeda = texto.replace(/R\$/gi, "").replace(/\s/g, "");
  const normalizado = semMoeda.includes(",") ? semMoeda.replace(/\./g, "").replace(",", ".") : semMoeda;
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : 0;
}
function numeroPolitica(valor) {
  if (valor == null || valor === "") return null;
  if (typeof valor === "number") return Number.isFinite(valor) && valor > 0 ? valor : null;
  const texto = limparTexto(valor);
  if (!texto || texto === "*" || /^(N\/?D|N\/A|PENDENTE|NAO SE APLICA)$/i.test(texto)) return null;
  const n = numero(texto);
  return n > 0 ? n : null;
}

function main() {
  const caminho = path.resolve(ARQUIVO_EXCEL);
  if (!fs.existsSync(caminho)) {
    console.error(`\nArquivo nao encontrado: ${caminho}\n`);
    process.exit(1);
  }
  const workbook = XLSX.readFile(caminho, { cellDates:false });
  if (!workbook.SheetNames.includes(NOME_ABA)) {
    console.error(`\nAba "${NOME_ABA}" nao encontrada.\n`);
    process.exit(1);
  }
  const linhas = XLSX.utils.sheet_to_json(workbook.Sheets[NOME_ABA], { header:1, blankrows:false, defval:"", raw:true });
  const modelos=[]; const avisos=[];
  for (let i=LINHA_INICIO_DADOS-1; i<linhas.length; i++) {
    const linha=linhas[i];
    const modelo=limparTexto(linha[COLUNAS.descricao]);
    if (!modelo) continue;
    const familia=limparTexto(linha[COLUNAS.familia]);
    const pps=numero(linha[COLUNAS.pps]);
    if (PULAR_MODELOS_COM_PPS_ZERO && pps===0) continue;
    const precoPolitica=numeroPolitica(linha[COLUNAS.preco]);
    if (!familia) avisos.push(`Linha ${i+1}: ${modelo} sem FAMILIA.`);
    if (pps===0) avisos.push(`Linha ${i+1}: ${modelo} com PPS zerado/ausente.`);
    if (precoPolitica===null) avisos.push(`Linha ${i+1}: ${modelo} sem PRECO (R$).`);
    const item={ familia, modelo, anoModelo:limparTexto(linha[COLUNAS.my]), my:limparTexto(linha[COLUNAS.my]), mvs:limparTexto(linha[COLUNAS.mvs]), pps, margem:numero(linha[COLUNAS.margem]), lb:0, bonus:0, combustivel:limparTexto(linha[COLUNAS.comb]), precoPolitica, observacao:"", tipoAutorizacao:"REGIONAL" };
    modelos.push(item);
    if (modoTeste) { console.log(`\n--- Linha ${i+1} da planilha ---`); console.dir(item,{depth:null}); }
  }
  if (avisos.length) { console.log("\nAVISOS:"); avisos.forEach(a=>console.log("  - "+a)); }
  console.log(`\nTotal de modelos Jeep lidos: ${modelos.length}`);
  if (modoTeste) { console.log("MODO TESTE: nenhum arquivo foi gravado.\nSe estiver correto, rode: node gerar-json.cjs\n"); return; }
  const destino=path.resolve(ARQUIVO_SAIDA);
  fs.mkdirSync(path.dirname(destino),{recursive:true});
  fs.writeFileSync(destino,JSON.stringify({marca:"JEEP",mesReferencia:MES_REFERENCIA,modelos},null,2),"utf-8");
  console.log(`\nArquivo gerado: ${destino}`);
  console.log(`Total de modelos: ${modelos.length}`);
}
main();
