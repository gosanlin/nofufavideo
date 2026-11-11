import { EMBED_ALLOW } from "./EmbedPlayer";

// El embed redirige de lulustream.com a luluvid.com: el permiso debe valer para cualquier origen.
test("el iframe permite pantalla completa tras la redirección del embed", () => {
  expect(EMBED_ALLOW.split(";").map((x) => x.trim())).toContain("fullscreen *");
});
