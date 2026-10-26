import { CredentialsSignin } from "next-auth";

// Lançado pelo `authorize` quando o backend recusa o login de uma conta cujo e-mail ainda não foi confirmado (403 com
// code EMAIL_NOT_VERIFIED, que o backend só devolve DEPOIS de a senha estar certa). O Auth.js repassa um erro que seja
// AuthError intacto até o `signIn()` do servidor, com o `code` preservado; o login (entrar/actions.ts) o distingue de
// "senha errada" só por este código.
export const EMAIL_NOT_VERIFIED_AUTH_CODE = "email_not_verified";

export class EmailNotVerifiedError extends CredentialsSignin {
  code = EMAIL_NOT_VERIFIED_AUTH_CODE;
}
