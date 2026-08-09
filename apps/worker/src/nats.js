
import { connect } from "nats";

export async function connectNats() {
  const host = process.env.NATS_HOST || "anvilbus";
  const port = process.env.NATS_PORT || "4222";
  const user = process.env.NATS_USER;
  const pass = process.env.NATS_PASS;
  const servers = `${host}:${port}`;
  return connect({
    servers,
    user: user || undefined,
    pass: pass || undefined,
  });
}
