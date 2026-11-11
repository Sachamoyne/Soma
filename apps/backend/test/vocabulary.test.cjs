const assert = require("node:assert/strict");
const { test } = require("node:test");
const languages = require("../dist/routes/languages.js").default;
const pdf = require("../dist/routes/pdf.js").default;

async function callRoute(router, path, input) {
  const route = router.stack.find((layer) => layer.route?.path === path).route;
  const handler = route.stack.at(-1).handle;
  const response = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  await handler({ userId: "test-user", ...input }, response);
  return response;
}

function modelResponse(content) {
  return Response.json({ choices: [{ message: { content } }] });
}

test("photo extraction preserves columns and fallback pairs stay on their original rows", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () =>
    modelResponse("猫\tchat\r\nchien\t犬\r\n\tmissing cell\r\n")
  );
  const photo = await callRoute(languages, "/extract-vocabulary-text", {
    file: { buffer: Buffer.from("test"), mimetype: "image/jpeg", originalname: "vocab.jpg", size: 4 },
  });
  assert.equal(photo.statusCode, 200);
  assert.equal(photo.body.text, "猫\tchat\nchien\t犬\n\tmissing cell");

  fetch.mock.mockImplementation(async () => new Response(null, { status: 503 }));
  const parsed = await callRoute(languages, "/parse-vocabulary", {
    body: { text: photo.body.text, sourceLanguage: "Français", targetLanguage: "Japonais" },
  });
  assert.equal(parsed.statusCode, 200);
  assert.equal(parsed.body.usedFallback, true);
  assert.deepEqual(parsed.body.entries, [
    { wordSource: "chat", wordTarget: "猫" },
    { wordSource: "chien", wordTarget: "犬" },
  ]);
});

test("parser corrects reversed Japanese columns and flags ambiguous or cross-row matches", async (t) => {
  t.mock.method(globalThis, "fetch", async () => modelResponse(JSON.stringify({
    entries: [
      { wordSource: "chat", wordTarget: "猫" },
      { wordSource: "犬", wordTarget: "chat" },
      { wordSource: "inu", wordTarget: "chien" },
      { wordSource: "犬", wordTarget: "chien", needsReview: true },
    ],
  })));
  const parsed = await callRoute(languages, "/parse-vocabulary", {
    body: { text: "猫\tchat\nchien\t犬", sourceLanguage: "Japanese", targetLanguage: "French" },
  });
  assert.equal(parsed.statusCode, 200);
  assert.deepEqual(parsed.body.entries.map(({ wordSource, wordTarget, needsReview }) =>
    [wordSource, wordTarget, Boolean(needsReview)]
  ), [
    ["猫", "chat", false],
    ["犬", "chat", true],
    ["inu", "chien", true],
    ["犬", "chien", true],
  ]);
});

function twoColumnPdf() {
  const contents = "BT /F1 12 Tf 45 700 Td (chat) Tj 140 0 Td (cat) Tj ET\n" +
    "BT /F1 12 Tf 45 680 Td (chien) Tj 140 0 Td (dog) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${contents.length} >>\nstream\n${contents}\nendstream`,
  ];
  let document = "%PDF-1.4\n";
  const offsets = objects.map((object, index) => {
    const offset = document.length;
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = document.length;
  document += "xref\n0 6\n0000000000 65535 f \n";
  for (const offset of offsets) document += `${String(offset).padStart(10, "0")} 00000 n \n`;
  return Buffer.from(document + `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
}

test("vocabulary PDF keeps each pair on its own line in a short selectable-text document", async (t) => {
  const buffer = twoColumnPdf();
  const input = { file: { buffer, originalname: "words.pdf", mimetype: "application/pdf", size: buffer.length } };
  const vocabulary = await callRoute(pdf, "/import", { ...input, query: { layout: "vocabulary" } });
  assert.equal(vocabulary.statusCode, 200);
  assert.deepEqual(vocabulary.body.text.split("\n").map((line) => line.trim().split(/\s+/)), [
    ["chat", "cat"],
    ["chien", "dog"],
  ]);
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    assert.equal(JSON.parse(options.body).messages[1].content, vocabulary.body.text);
    return modelResponse('{"entries":[{"wordSource":"chat","wordTarget":"cat"},{"wordSource":"chien","wordTarget":"dog"}]}');
  });
  const parsed = await callRoute(languages, "/parse-vocabulary", {
    body: { text: vocabulary.body.text, sourceLanguage: "French", targetLanguage: "English" },
  });
  assert.equal(parsed.body.entries.length, 2);
  const general = await callRoute(pdf, "/import", { ...input, query: {} });
  assert.equal(general.statusCode, 422);
  assert.equal(general.body.code, "PDF_NO_TEXT");
});
