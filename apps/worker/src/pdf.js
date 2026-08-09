import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomBytes } from "node:crypto";

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { ...opts, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} failed (${code}): ${stderr || stdout}`));
    });
  });
}

async function withTemp(fn) {
  const dir = path.join(os.tmpdir(), `anvil-${randomBytes(6).toString("hex")}`);
  await fs.mkdir(dir, { recursive: true });
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

export async function mergePdfs(buffers) {
  return withTemp(async (dir) => {
    const inputs = [];
    for (let i = 0; i < buffers.length; i++) {
      const f = path.join(dir, `in${i}.pdf`);
      await fs.writeFile(f, buffers[i]);
      inputs.push(f);
    }
    const out = path.join(dir, "out.pdf");
    await run("qpdf", ["--empty", "--pages", ...inputs, "--", out]);
    return fs.readFile(out);
  });
}

export async function splitPdf(buffer, from, to) {
  return withTemp(async (dir) => {
    const input = path.join(dir, "in.pdf");
    const out = path.join(dir, "out.pdf");
    await fs.writeFile(input, buffer);
    await run("qpdf", [input, "--pages", ".", `${from}-${to}`, "--", out]);
    return fs.readFile(out);
  });
}

export async function compressPdf(buffer) {
  return withTemp(async (dir) => {
    const input = path.join(dir, "in.pdf");
    const out = path.join(dir, "out.pdf");
    await fs.writeFile(input, buffer);
    // ghostscript screen settings = aggressive but usable
    try {
      await run("gs", [
        "-sDEVICE=pdfwrite",
        "-dCompatibilityLevel=1.4",
        "-dPDFSETTINGS=/ebook",
        "-dNOPAUSE",
        "-dQUIET",
        "-dBATCH",
        `-sOutputFile=${out}`,
        input,
      ]);
      const result = await fs.readFile(out);
      if (result.length > 0 && result.length < buffer.length) return result;
    } catch {}
    // fallback: qpdf linearize/object streams
    await run("qpdf", ["--object-streams=generate", "--compress-streams=y", input, out]);
    const fallback = await fs.readFile(out);
    return fallback.length > 0 ? fallback : buffer;
  });
}

export async function imagesToPdf(imageBuffers, names = []) {
  return withTemp(async (dir) => {
    const imgs = [];
    for (let i = 0; i < imageBuffers.length; i++) {
      const ext = (names[i] || "").match(/\.(png|jpe?g|webp)$/i)?.[1]?.toLowerCase() || "png";
      const f = path.join(dir, `img${i}.${ext === "jpeg" ? "jpg" : ext}`);
      await fs.writeFile(f, imageBuffers[i]);
      imgs.push(f);
    }
    const out = path.join(dir, "out.pdf");
    // img2pdf if available, else convert (ImageMagick)
    try {
      await run("img2pdf", [...imgs, "-o", out]);
    } catch {
      await run("convert", [...imgs, out]);
    }
    return fs.readFile(out);
  });
}

export async function whichTools() {
  const checks = ["qpdf", "gs", "img2pdf", "convert"];
  const out = {};
  for (const c of checks) {
    try {
      await run("which", [c]);
      out[c] = true;
    } catch {
      out[c] = false;
    }
  }
  return out;
}
