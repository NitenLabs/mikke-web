// packages/core がサーバー（Node）でも読めることと、① から品の並び・お品書きを作れることの確かめ
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as core from "../index.js";

const shop = JSON.parse(fs.readFileSync(new URL("../../../samples/ashiyado/shop.json", import.meta.url), "utf8"));
const content = JSON.parse(fs.readFileSync(new URL("../content/wa-01.json", import.meta.url), "utf8"));

test("Node で読める（DOM なし）", () => {
  for (const k of ["SPEC", "RESOLVE", "BANCHOR", "C3", "TEXT", "CATALOG", "BASE_CSS", "FONT_LINK", "ROOTVARS"]) assert.ok(core[k], k);
  assert.equal(core.SPEC.DESIGN_W.pc, 1440);
  assert.equal(typeof core.C3.buildHeader, "function");
  assert.ok(content && typeof content === "object");
});

test("値段の文字", () => {
  const { formatPrices } = core.CATALOG;
  assert.equal(formatPrices([{ type: "fixed", amount: 1200 }]), "1,200円（税込）");
  assert.equal(formatPrices([{ type: "market" }]), "時価");
});

test("お品書き・品の並びを ① から作る", () => {
  const { deriveMenuGroups, deriveGroup } = core.CATALOG;
  const g = deriveMenuGroups(shop);
  assert.ok(g.length >= 1 && g[0].cats.length >= 1);
  const rows = deriveGroup(shop, { menu: "mnu_kanmi" }, "table");
  assert.ok(Array.isArray(rows));
  for (const r of rows) assert.ok(r.id.startsWith("t_"));
});

test("お店の情報 ① の連絡先・場所（J44・J45・F24）", () => {
  const S = core.SHOPINFO; const sh = JSON.parse(JSON.stringify(shop));
  assert.equal(S.linkedText(sh, "addr"), "〒659-0000 兵庫県芦屋市大原町0-0");
  assert.equal(S.linkedText(sh, "footAddr"), "兵庫県芦屋市大原町");
  assert.equal(S.storeOf(sh).tel.digits, "0797000000");
  S.applyContactText(sh, "tel", "078-111-2222"); assert.equal(S.storeOf(sh).tel.digits, "0781112222");
  S.applyContactText(sh, "addr", "〒650-0001 兵庫県神戸市中央区加納町1-1");
  assert.equal(sh.location.city, "神戸市中央区"); assert.equal(sh.location.geo, undefined);
  assert.equal(S.linkedText(sh, "footAddr"), "兵庫県神戸市中央区加納町");
  assert.ok(decodeURIComponent(S.mapHref(sh)).includes("加納町"));
  assert.deepEqual(S.contactProblems(shop), []);
  S.applyContactText(sh, "tel", "あとで"); assert.equal(S.contactProblems(sh)[0].key, "tel");
});
