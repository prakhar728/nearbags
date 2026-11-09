import { createPublicClient, http } from "viem";
import { bsc } from "viem/chains";
const c = createPublicClient({ chain: bsc, transport: http("https://bsc-rpc.publicnode.com") });
const token = "0xc008c5f579ec1450f20099c39f587547e27c7523" as const; // SGOVon
const slots = {
  impl: "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
  beacon: "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50",
} as const;
let implAddr: `0x${string}` | null = null;
for (const [k, s] of Object.entries(slots)) {
  const v = await c.getStorageAt({ address: token, slot: s as `0x${string}` });
  const a = ("0x" + (v ?? "").slice(-40)) as `0x${string}`;
  if (v && BigInt(v) !== 0n) {
    console.log(k, a);
    if (k === "impl") implAddr = a;
    else {
      const r = await c.call({ to: a, data: "0x5c60da1b" }); // implementation()
      implAddr = ("0x" + r.data!.slice(-40)) as `0x${string}`;
      console.log("beacon impl", implAddr);
    }
  }
}
if (!implAddr) throw new Error("no proxy slot found");
const code = (await c.getCode({ address: implAddr }))!;
const sels = new Set<string>();
for (const m of code.matchAll(/63([0-9a-f]{8})/g)) sels.add("0x" + m[1]);
const list = [...sels];
const res = await fetch(`https://api.4byte.sourcify.dev/signature-database/v1/lookup?function=${list.join(",")}&filter=true`).then((r) => r.json()).catch(() => null);
const names = list.map((s) => res?.result?.function?.[s]?.[0]?.name ?? s);
console.log(names.join("  "));
console.log(`(${list.length} selectors, ${names.filter((n) => !n.startsWith("0x")).length} named)`);
