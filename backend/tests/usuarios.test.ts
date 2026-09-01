import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// O modulo de config valida o ambiente na importacao, e a conexao abre o banco
// no caminho de DATABASE_PATH. Ambos precisam estar prontos antes do import.
process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "usuarios-")), "teste.db");
process.env.SANKHYA_BASE_URL ??= "https://exemplo.invalido";
process.env.SANKHYA_TOKEN ??= "token-de-teste";
process.env.SANKHYA_CLIENT_ID ??= "cliente";
process.env.SANKHYA_CLIENT_SECRET ??= "segredo";
process.env.APP_TOTP_SECRET ??= "JBSWY3DPEHPK3PXP";
process.env.APP_SESSION_SECRET ??= "segredo-de-sessao-para-teste-123456";
process.env.APP_LOGIN_EMAIL ??= "dono@exemplo.com";
process.env.APP_LOGIN_PASSWORD ??= "senha-do-dono-1234";
process.env.USUARIOS_INICIAIS = "Financeiro@Exemplo.com:senhaInicial1, invalida-sem-senha, curta@exemplo.com:123";

const { migrate } = await import("../src/db/migrate.js");
const { autenticarUsuarioArmazenado, buscarUsuario, semearUsuariosIniciais, trocarSenha } =
  await import("../src/usuarios.js");
const { authenticateLogin } = await import("../src/auth.js");

migrate();

test("semeia apenas entradas bem formadas e normaliza o e-mail", () => {
  const resultado = semearUsuariosIniciais();
  assert.deepEqual(resultado.criados, ["financeiro@exemplo.com"]);
  assert.equal(resultado.ignorados.length, 2);
});

test("a conta nasce com troca de senha obrigatoria", () => {
  const usuario = buscarUsuario("financeiro@exemplo.com");
  assert.ok(usuario);
  assert.equal(usuario.deve_trocar_senha, 1);
});

test("a senha nao e guardada em texto", () => {
  const usuario = buscarUsuario("financeiro@exemplo.com");
  assert.ok(usuario);
  assert.doesNotMatch(usuario.senha_hash, /senhaInicial1/);
  assert.ok(usuario.senha_salt.length >= 32);
});

test("autentica com a senha inicial, ignorando caixa do e-mail", () => {
  assert.ok(autenticarUsuarioArmazenado("FINANCEIRO@exemplo.com", "senhaInicial1"));
  assert.equal(autenticarUsuarioArmazenado("financeiro@exemplo.com", "outra-senha"), null);
});

test("o login marca a troca pendente", () => {
  const usuario = authenticateLogin("financeiro@exemplo.com", "senhaInicial1");
  assert.ok(usuario);
  assert.equal(usuario.deveTrocarSenha, true);
  assert.equal(usuario.role, "executive");
});

test("recusa nova senha curta, igual a atual, ou com senha atual errada", () => {
  assert.equal(trocarSenha("financeiro@exemplo.com", "errada", "novaSenhaBoa1").ok, false);
  assert.equal(trocarSenha("financeiro@exemplo.com", "senhaInicial1", "curta").ok, false);
  assert.equal(trocarSenha("financeiro@exemplo.com", "senhaInicial1", "senhaInicial1").ok, false);
});

test("troca a senha, limpa a pendencia e invalida a senha antiga", () => {
  assert.equal(trocarSenha("financeiro@exemplo.com", "senhaInicial1", "novaSenhaBoa1").ok, true);
  assert.equal(autenticarUsuarioArmazenado("financeiro@exemplo.com", "senhaInicial1"), null);

  const usuario = authenticateLogin("financeiro@exemplo.com", "novaSenhaBoa1");
  assert.ok(usuario);
  assert.equal(usuario.deveTrocarSenha, false);
});

test("semear de novo nao sobrescreve a senha ja trocada", () => {
  semearUsuariosIniciais();
  assert.equal(autenticarUsuarioArmazenado("financeiro@exemplo.com", "senhaInicial1"), null);
  assert.ok(autenticarUsuarioArmazenado("financeiro@exemplo.com", "novaSenhaBoa1"));
});

test("conta de ambiente nao troca senha por aqui", () => {
  const resultado = trocarSenha("dono@exemplo.com", "senha-do-dono-1234", "outraSenha123");
  assert.equal(resultado.ok, false);
});
