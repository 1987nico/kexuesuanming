import { describe, expect, it } from "vitest";
import {
  buildParentRelayImagePrompt,
  extractParentRelayCoverFacts,
} from "./parentRelayCover";

const body = `【情景演绎｜根据常见留学生求职经历改编】
今天下午1点20分，我们到了上海国际青年人才中心（虚构）三楼。玻璃门上贴着「锦岳消费科技（虚构）2027届海外管培生终面」。
老二把A18号胸牌别在西装上，手里攥着蓝色和粉色两份文件袋。
后来找专业的老师带。第19天，他收到了澄海数字科技（虚构）杭州用户策略岗的Offer，年薪34.2万元。`;

describe("parent relay cover workflow", () => {
  it("extracts the current onsite line and older sibling result line", () => {
    const facts = extractParentRelayCoverFacts({ body });

    expect(facts.venueName).toBe("上海国际青年人才中心（虚构）");
    expect(facts.recruitingCompany).toBe("锦岳消费科技（虚构）");
    expect(facts.offerCompany).toBe("澄海数字科技（虚构）");
    expect(facts.candidateNumber).toBe("A18");
    expect(facts.offerSalary).toBe("34.2万元");
    expect(facts.headlineLines).toEqual(["老大已拿34.2万Offer", "老二刚进终面"]);
  });

  it("builds an integrated wild recruitment scene instead of a floating UI collage", () => {
    const facts = extractParentRelayCoverFacts({ body });
    const prompt = buildParentRelayImagePrompt(facts, "招聘现场版");

    expect(prompt.imageLabel).toBe("家长双线接力体图片");
    expect(prompt.imagePrompt).toContain("野生招聘现场抓拍");
    expect(prompt.imagePrompt).toContain("当前叫号 A18 / 请到");
    expect(prompt.imagePrompt).toContain("直接生成在照片对应物体上");
    expect(prompt.imagePrompt).toContain("脱敏Offer邮件");
    expect(prompt.imagePrompt).toContain("图片本身不要生成这两行大标题");
    expect(prompt.negativePrompt).toContain("不要悬浮白色邮件卡");
    expect(prompt.negativePrompt).toContain("巨大蓝色叫号卡");
  });

  it("uses a phone-led comparison composition for the result variant", () => {
    const facts = extractParentRelayCoverFacts({ body });
    const prompt = buildParentRelayImagePrompt(facts, "结果对照版");

    expect(prompt.imagePrompt).toContain("手机约占画面宽度28%");
    expect(prompt.imagePrompt).toContain("老大Offer结果＋老二当前招聘现场");
    expect(prompt.imagePrompt).toContain("年薪 34.2万元");
  });
});
