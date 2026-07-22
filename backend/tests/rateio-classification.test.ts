import assert from "node:assert/strict";
import test from "node:test";
import {
  classificarRateio,
  isProjetoEmpresaDestino,
} from "../src/services/rateio-classification.js";

test("reconhece somente os sete projetos que representam empresas", () => {
  assert.equal(isProjetoEmpresaDestino(40_099_999), false);
  assert.equal(isProjetoEmpresaDestino(40_100_000), true);
  assert.equal(isProjetoEmpresaDestino(40_150_000), false);
  assert.equal(isProjetoEmpresaDestino(40_700_000), true);
  assert.equal(isProjetoEmpresaDestino(40_700_001), false);
});

test("sem linhas e SEM_RATEIO", () => {
  assert.equal(classificarRateio([]).status, "SEM_RATEIO");
});

test("100% em uma empresa de destino e NAO_RATEIO", () => {
  const resultado = classificarRateio([{ codproj: 40_100_000, percentual: 100 }]);
  assert.equal(resultado.status, "NAO_RATEIO");
  assert.deepEqual(resultado.projetosValidos, [40_100_000]);
});

test("100% em duas empresas de destino e COM_RATEIO", () => {
  const resultado = classificarRateio([
    { codproj: 40_100_000, percentual: 60 },
    { codproj: 40_200_000, percentual: 40 },
  ]);
  assert.equal(resultado.status, "COM_RATEIO");
  assert.deepEqual(resultado.projetosValidos, [40_100_000, 40_200_000]);
});

test("percentual total diferente de 100 e RATEIO_INCOMPLETO", () => {
  const resultado = classificarRateio([
    { codproj: 40_100_000, percentual: 50 },
    { codproj: 40_200_000, percentual: 40 },
  ]);
  assert.equal(resultado.status, "RATEIO_INCOMPLETO");
  assert.equal(resultado.somaInvalida, true);
});

test("percentual fora da faixa de empresas torna o rateio incompleto", () => {
  const resultado = classificarRateio([
    { codproj: 40_100_000, percentual: 80 },
    { codproj: 123, percentual: 20 },
  ]);
  assert.equal(resultado.status, "RATEIO_INCOMPLETO");
  assert.equal(resultado.percentualSemDestino, 20);
  assert.equal(resultado.destinoInvalido, true);
});

test("linha de zero por cento fora da faixa nao invalida um destino completo", () => {
  const resultado = classificarRateio([
    { codproj: 40_100_000, percentual: 100 },
    { codproj: null, percentual: 0 },
  ]);
  assert.equal(resultado.status, "NAO_RATEIO");
});

test("percentuais invalidos que se anulam nao escondem uma distribuicao incorreta", () => {
  const resultado = classificarRateio([
    { codproj: 40_100_000, percentual: 100 },
    { codproj: 123, percentual: 10 },
    { codproj: 456, percentual: -10 },
  ]);
  assert.equal(resultado.totalPerc, 100);
  assert.equal(resultado.status, "RATEIO_INCOMPLETO");
  assert.equal(resultado.destinoInvalido, true);
});
