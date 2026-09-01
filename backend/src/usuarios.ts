import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getDb } from "./db/connection.js";
import { config } from "./config.js";

/**
 * Contas guardadas no snapshot, com senha propria e troca obrigatoria no
 * primeiro acesso.
 *
 * Convive com as contas de ambiente (APP_LOGIN_* e JULIANA_LOGIN_*): aquelas
 * tem a senha no .env e nao trocam por aqui. Esta tabela existe porque
 * "trocar a senha no primeiro login" precisa de estado por usuario, coisa que
 * variavel de ambiente nao guarda.
 */

const SCRYPT_KEYLEN = 64;
const TAMANHO_MINIMO_SENHA = 8;

export type UsuarioArmazenado = {
  email: string;
  senha_hash: string;
  senha_salt: string;
  deve_trocar_senha: number;
};

function derivar(senha: string, salt: string): string {
  return scryptSync(senha, salt, SCRYPT_KEYLEN).toString("hex");
}

function conferir(senha: string, usuario: UsuarioArmazenado): boolean {
  const esperado = Buffer.from(usuario.senha_hash, "hex");
  const recebido = Buffer.from(derivar(senha, usuario.senha_salt), "hex");
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido);
}

function normalizar(email: string): string {
  return email.trim().toLowerCase();
}

export function buscarUsuario(email: string): UsuarioArmazenado | null {
  const linha = getDb()
    .prepare(
      "SELECT email, senha_hash, senha_salt, deve_trocar_senha FROM usuarios WHERE email = ?",
    )
    .get(normalizar(email)) as UsuarioArmazenado | undefined;
  return linha ?? null;
}

/** Devolve o usuario quando a senha confere; null em qualquer outro caso. */
export function autenticarUsuarioArmazenado(
  email: string,
  senha: string,
): UsuarioArmazenado | null {
  const usuario = buscarUsuario(email);
  if (!usuario) return null;
  return conferir(senha, usuario) ? usuario : null;
}

export type ResultadoTroca =
  | { ok: true }
  | { ok: false; motivo: string };

export function trocarSenha(email: string, senhaAtual: string, novaSenha: string): ResultadoTroca {
  const usuario = buscarUsuario(email);
  if (!usuario) {
    return {
      ok: false,
      motivo: "Esta conta tem a senha definida na configuracao do servidor e nao pode ser trocada por aqui.",
    };
  }
  if (!conferir(senhaAtual, usuario)) {
    return { ok: false, motivo: "A senha atual esta incorreta." };
  }
  if (novaSenha.length < TAMANHO_MINIMO_SENHA) {
    return { ok: false, motivo: `A nova senha precisa ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.` };
  }
  if (conferir(novaSenha, usuario)) {
    return { ok: false, motivo: "A nova senha precisa ser diferente da atual." };
  }

  const salt = randomBytes(16).toString("hex");
  getDb()
    .prepare(
      `UPDATE usuarios
          SET senha_hash = ?, senha_salt = ?, deve_trocar_senha = 0, senha_alterada_em = ?
        WHERE email = ?`,
    )
    .run(derivar(novaSenha, salt), salt, new Date().toISOString(), usuario.email);

  return { ok: true };
}

/**
 * Cria as contas listadas em USUARIOS_INICIAIS, no formato
 * `email:senha` separado por virgula. Apenas cria: uma conta que ja existe
 * nunca tem a senha sobrescrita, entao deixar a variavel no ambiente depois
 * da primeira troca nao reverte nada.
 *
 * A senha inicial fica so no ambiente — nunca no repositorio — e a conta
 * nasce com troca obrigatoria.
 */
export function semearUsuariosIniciais(): { criados: string[]; ignorados: string[] } {
  const criados: string[] = [];
  const ignorados: string[] = [];
  const bruto = config.USUARIOS_INICIAIS?.trim();
  if (!bruto) return { criados, ignorados };

  const inserir = getDb().prepare(
    `INSERT INTO usuarios (email, senha_hash, senha_salt, deve_trocar_senha, criado_em)
     VALUES (?, ?, ?, 1, ?)`,
  );

  for (const entrada of bruto.split(",")) {
    const texto = entrada.trim();
    if (!texto) continue;

    const separador = texto.indexOf(":");
    if (separador <= 0) {
      ignorados.push(texto);
      continue;
    }

    const email = normalizar(texto.slice(0, separador));
    const senha = texto.slice(separador + 1);
    if (!email.includes("@") || senha.length < TAMANHO_MINIMO_SENHA) {
      ignorados.push(email || texto);
      continue;
    }
    if (buscarUsuario(email)) continue;

    const salt = randomBytes(16).toString("hex");
    inserir.run(email, derivar(senha, salt), salt, new Date().toISOString());
    criados.push(email);
  }

  return { criados, ignorados };
}
