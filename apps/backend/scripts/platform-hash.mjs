// Gera o hash bcrypt da senha da conta da plataforma (PLATFORM_ADMIN_PASSWORD_HASH).
//
//   pnpm --filter backend platform:hash
//
// A senha é digitada num prompt SEM eco (não vai para o histórico do shell nem para a lista de
// processos, ao contrário de passar como argumento) e só o hash é impresso. Mínimo de 12 caracteres.
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import bcrypt from "bcrypt";

const ROUNDS = 12;
const MIN_LENGTH = 12;

let muted = false;
const output = new Writable({
  write(chunk, _encoding, callback) {
    if (!muted) process.stdout.write(chunk);
    callback();
  },
});

// Em TTY o eco é suprimido pelo `output` mudo; com stdin redirecionado (CI/teste) não há eco a esconder.
const rl = createInterface({ input: process.stdin, output, terminal: Boolean(process.stdin.isTTY) });
const lines = rl[Symbol.asyncIterator]();

async function ask(question, { hidden = false } = {}) {
  process.stdout.write(question);
  muted = hidden;
  const { value, done } = await lines.next();
  muted = false;
  if (hidden) process.stdout.write("\n");
  return done ? "" : value;
}

try {
  const password = await ask("Senha da conta da plataforma: ", { hidden: true });
  if (password.length < MIN_LENGTH) {
    console.error(`Senha curta demais: use pelo menos ${MIN_LENGTH} caracteres.`);
    process.exitCode = 1;
  } else if (Buffer.byteLength(password) > 72) {
    console.error("Senha longa demais: o bcrypt só considera os primeiros 72 bytes.");
    process.exitCode = 1;
  } else {
    const confirm = await ask("Repita a senha: ", { hidden: true });
    if (confirm !== password) {
      console.error("As senhas não conferem.");
      process.exitCode = 1;
    } else {
      const hash = await bcrypt.hash(password, ROUNDS);
      console.log("\nAdicione ao apps/backend/.env (aspas simples: o hash contém `$`):\n");
      console.log('PLATFORM_ADMIN_EMAIL="seu-email@empresa.com.br"');
      console.log(`PLATFORM_ADMIN_PASSWORD_HASH='${hash}'\n`);
    }
  }
} finally {
  rl.close();
}
