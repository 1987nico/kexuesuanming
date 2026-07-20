import { describe, it } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { renderGoldenReportHtml } from "./goldenReportHtml";

const fixtures = [
  "/sessions/sweet-serene-newton/step4_data.json",
  "/sessions/sweet-serene-newton/step5_data.json",
  "/sessions/sweet-serene-newton/golden_body_data.json",
];
const emitIt = fixtures.every(existsSync) ? it : it.skip;

describe("emit golden html for visual check", () => {
  emitIt("writes /tmp/golden_render.html from golden sample data", () => {
    const market = JSON.parse(readFileSync("/sessions/sweet-serene-newton/step4_data.json", "utf8"));
    const vrin = JSON.parse(readFileSync("/sessions/sweet-serene-newton/step5_data.json", "utf8"));
    const body = JSON.parse(readFileSync("/sessions/sweet-serene-newton/golden_body_data.json", "utf8"));
    const html = renderGoldenReportHtml({ customerName: "金样本大报告", market, vrin, ...body });
    writeFileSync("/tmp/golden_render.html", html);
  });
});
