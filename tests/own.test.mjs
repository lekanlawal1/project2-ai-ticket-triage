import { test } from "node:test";
import assert from "node:assert/strict";
import { redact } from "../site/redact.js";
import { parse, sniff, guessColumns, toCSV } from "../site/csv.js";
import { train, shuffle, seeded, grams } from "../site/train.js";
import { load, predict } from "../site/baseline.js";

test("personal details are hidden before anything is sent; dates and amounts stay", () => {
  const r = redact("I'm jo.smith+help@mail.co.uk, call 416-555-0199 or (905) 555 1234. Card 4111 1111 1111 1111, order 20240115, see https://x.co/a?b=1 or M5V 2T6. Paid $1,250.00 on 2024-01-15.");
  assert.equal(r.text, "I'm [email], call [number] or [number]. Card [number], order [number], see [link] or [postcode]. Paid $1,250.00 on 2024-01-15.");
  assert.deepEqual(r.counts, { email: 1, link: 1, postcode: 1, number: 4 });
  assert.equal(redact("My PIN 1234 stopped working").text, "My PIN 1234 stopped working", "short numbers stay");
});

test("CSV: quoted separators, doubled quotes and line breaks inside a field", () => {
  const rows = parse('message,team\r\n"Hi, my card ""broke""\nagain",Cards\nWhere is my money?,Transfers\n\n');
  assert.deepEqual(rows, [["message", "team"], ['Hi, my card "broke"\nagain', "Cards"], ["Where is my money?", "Transfers"]]);
  assert.equal(sniff("a;b;c\n1;2;3"), ";");
  assert.equal(sniff("text\tqueue"), "\t");
  assert.deepEqual(parse("one message\nanother one\n"), [["one message"], ["another one"]], "no separators: one message per line");
  assert.equal(toCSV([["a,b", 'say "hi"'], ["c", "d"]]), '"a,b","say ""hi"""\r\nc,d');
});

test("the message and team columns are found from the header, or from which column is longest", () => {
  assert.deepEqual(guessColumns(["id", "Subject", "Assigned group"], [["1", "My card was charged twice", "Cards"]]), { message: 1, team: 2 });
  assert.deepEqual(guessColumns(["a", "b"], [["7", "a long free text column here"]]), { message: 1, team: -1 });
});

test("the browser-trained plain model learns teams it's shown, and predicts through the demo's own code", async () => {
  const data = [];
  const words = { billing: ["invoice", "refund", "charged", "payment"], tech: ["crash", "login", "error", "password"], sales: ["pricing", "quote", "upgrade", "plan"] };
  const rand = seeded(3);
  for (const [team, w] of Object.entries(words)) for (let i = 0; i < 30; i++) data.push([`please help with my ${w[i % 4]} and the ${w[(i + 1) % 4]} today`, team]);
  const rows = shuffle(data, rand);
  const m = load(await train(rows.map((r) => r[0]), rows.map((r) => r[1]), Object.keys(words), { epochs: 150 }));
  assert.equal(predict(m, "the app shows an error at login")[0].team, "tech");
  assert.equal(predict(m, "I was charged twice, I want a refund")[0].team, "billing");
  assert.ok(m.terms.includes("my invoice"), "word pairs are features too");
  assert.deepEqual(grams("Card PIN"), ["card", "pin", "card pin"]);
  assert.deepEqual(shuffle([1, 2, 3, 4, 5], seeded(9)), shuffle([1, 2, 3, 4, 5], seeded(9)), "the same file splits the same way every time");
});
