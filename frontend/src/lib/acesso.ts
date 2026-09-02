/**
 * Areas que ficam escondidas para contas especificas. Nao e uma barreira de
 * seguranca: e o painel deixando de mostrar o que aquela conta nao usa. Quem
 * nao esta na lista continua vendo tudo.
 */
const SEM_VIA_CERTA = new Set(["admin@grupomkr.com.br"]);

function normalizar(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

/** Falso apenas para as contas listadas acima. */
export function podeVerViaCerta(email: string | null | undefined): boolean {
  return !SEM_VIA_CERTA.has(normalizar(email));
}
