import { describe, expect, it } from "vitest";
import {
  buildTitleSemanticSignature,
  canonicalizeGrowthTitle,
  containsTraditionalChinese,
  evaluateGrowthTitleQuality,
  evaluateTitleSemanticDuplicate,
  findUnsupportedTitleClaims,
  hasGarbledLatinCjkMix,
  nativeTitleSemanticTopicKeys,
  titleForMethodSemanticComparison,
  titlesAreMethodAwareSemanticDuplicates,
  titlesAreSemanticDuplicates,
} from "./titleQuality";

describe("标题质量门禁", () => {
  it("统一常见繁体字，并明确标记原始输出含繁体", () => {
    expect(canonicalizeGrowthTitle("留學當下別衝動轉職")).toBe("留学当下别冲动转职");
    expect(containsTraditionalChinese("留學當下別衝動轉職")).toBe(true);
    expect(evaluateGrowthTitleQuality("留學當下別衝動轉職")).toMatchObject({
      canonicalTitle: "留学当下别冲动转职",
      acceptable: false,
      reasons: ["traditional_chinese"],
    });
  });

  it("拦截超长、乱码和明显生造黑话", () => {
    expect(evaluateGrowthTitleQuality("这是一个明显超过二十个字符的标题，不能直接发布").reasons).toContain("too_long");
    expect(hasGarbledLatinCjkMix("38岁gangga离开小公司，尴尬")).toBe(true);
    expect(evaluateGrowthTitleQuality("38岁gangga离开小公司，尴尬").reasons).toContain("garbled_latin_cjk");
    expect(evaluateGrowthTitleQuality("离体制邪修六步漏斗，饭局判胜算").reasons).toContain("unnatural_jargon");
    expect(evaluateGrowthTitleQuality("花百万留学，不敢跟爸妈说投了没信").reasons).toContain("unnatural_jargon");
    expect(evaluateGrowthTitleQuality("海归投简历没信，不敢跟爸妈说").reasons).toContain("unnatural_jargon");
    expect(evaluateGrowthTitleQuality("留学花了百万，秋招连岗都投错").reasons).toContain("unsupported_factual_claim");
    expect(evaluateGrowthTitleQuality("花家里钱留学，投错岗不敢说").reasons).toContain("unsupported_factual_claim");
    expect(evaluateGrowthTitleQuality("跟风投管培，还是蹲对口秋招岗？").reasons).toContain("unnatural_jargon");
    expect(evaluateGrowthTitleQuality("背景看着光鲜，投岗全没回音").reasons).toContain("unnatural_jargon");
    expect(evaluateGrowthTitleQuality("以前找教授写推，如今备背调").reasons).toContain("unnatural_jargon");
    expect(evaluateGrowthTitleQuality("我替孩子找内推，不如先对岗位").reasons).toContain("incomplete_sentence");
    expect(evaluateGrowthTitleQuality("我替孩子找内推，不如先看岗位匹配").acceptable).toBe(true);
    expect(evaluateGrowthTitleQuality("从前等机会，现在先做准备").reasons).toContain("generic_title");
    expect(evaluateGrowthTitleQuality("以前怕没学位，现在怕没方向").acceptable).toBe(true);
    expect(evaluateGrowthTitleQuality("投岗位前，先看匹配度").acceptable).toBe(true);
    expect(evaluateGrowthTitleQuality("求职没信心时，先收窄岗位").acceptable).toBe(true);
    expect(evaluateGrowthTitleQuality("AI筛简历后，先查岗位").acceptable).toBe(true);
  });

  it("拦截没有业务事实支持的具体身份、金额、成绩和日期", () => {
    const title = "前国企高管，创业首年营收五百万";
    expect(findUnsupportedTitleClaims(title)).not.toHaveLength(0);
    expect(evaluateGrowthTitleQuality(title).reasons).toContain("unsupported_factual_claim");
    expect(evaluateGrowthTitleQuality("2026年回国拿到大厂offer").reasons).toContain("unsupported_factual_claim");
    expect(evaluateGrowthTitleQuality(title, {
      supportedFacts: ["前国企高管", "创业首年营收五百万"],
    }).reasons).not.toContain("unsupported_factual_claim");
  });
});

describe("标题语义去重", () => {
  it("把仅替换措辞的实习/秋招二选一判为重复", () => {
    const result = evaluateTitleSemanticDuplicate(
      "先补实习，还是直接冲秋招？",
      "补实习攒经历，还是直接冲秋招",
    );
    expect(result.duplicate).toBe(true);
    expect(result.reasons).toContain("受众、场景和冲突相同");
    expect(result.left.scenario).toBe("internship_vs_autumn_recruitment");
  });

  it("把实习还是全职的素材换词判为重复", () => {
    const result = evaluateTitleSemanticDuplicate(
      "先找个实习过渡，还是死磕全职？",
      "先做远程实习，还是冲全职岗",
    );
    expect(result.duplicate).toBe(true);
    expect(result.left.scenario).toBe("internship_vs_full_time");
    expect(result.right.conflict).toBe("internship_or_full_time");
  });

  it("把留洋回国后瞎撞简历的改词判为重复", () => {
    expect(titlesAreSemanticDuplicates(
      "留洋镀金回来，投简历还瞎撞",
      "留洋读硕，回国投简历还瞎撞",
    )).toBe(true);
  });

  it("把平台身份下不敢转型的换词判为重复", () => {
    expect(titlesAreSemanticDuplicates(
      "攥着期权的总监，不敢提转行",
      "攥着工牌的总监，不敢换赛道",
    )).toBe(true);
  });

  it("把只替换后半句的长核心短语判为重复", () => {
    const result = evaluateTitleSemanticDuplicate(
      "花百万留学，不敢跟爸妈说秋招没方向",
      "花百万留学，不敢跟爸妈说投了没信",
    );
    expect(result.duplicate).toBe(true);
    expect(result.reasons.some((reason) => reason.includes("连续核心短语重复"))).toBe(true);
  });

  it("把家庭投入后不敢说秋招方向的换词判为重复", () => {
    const result = evaluateTitleSemanticDuplicate(
      "花百万留学，不敢跟爸妈说秋招没方向",
      "花爸妈钱留学，秋招不敢说没方向",
    );
    expect(result.duplicate).toBe(true);
    expect(result.reasons).toContain("父母压力下的求职困境母题相同");
    expect(result.left.conflict).toBe("parent_job_search_pressure");
    expect(result.right.conflict).toBe("parent_job_search_pressure");
  });

  it("把家庭投入后不敢说面试结果也判为同一母题", () => {
    const result = evaluateTitleSemanticDuplicate(
      "花爸妈钱留学，秋招不敢说没方向",
      "花爸妈钱留学，不敢说面试全挂",
    );
    expect(result.duplicate).toBe(true);
    expect(result.reasons).toContain("父母压力下的求职困境母题相同");
  });

  it("把父母压力下的投简历没信也判为同一母题", () => {
    const result = evaluateTitleSemanticDuplicate(
      "花爸妈钱留学，不敢说面试全挂",
      "海归投简历没信，不敢跟爸妈说",
    );
    expect(result.duplicate).toBe(true);
    expect(result.reasons).toContain("父母压力下的求职困境母题相同");
  });

  it("把花家里钱却不敢说的表达也判为父母压力母题", () => {
    const result = evaluateTitleSemanticDuplicate(
      "花百万留学，不敢跟爸妈说秋招没方向",
      "花家里钱留学，秋招方向全错不敢说",
    );
    expect(result.duplicate).toBe(true);
    expect(result.reasons).toContain("父母压力下的求职困境母题相同");
  });

  it("把家长怕给娃添压力、因此不敢多问秋招的改写判为同一母题", () => {
    const result = evaluateTitleSemanticDuplicate(
      "帮孩子盯秋招，不敢多问怕吵架",
      "怕给娃添压力，秋招的事不敢多问",
    );
    expect(result.duplicate).toBe(true);
    expect(result.reasons).toContain("父母压力下的求职困境母题相同");
  });

  it("把催孩子先定秋招方向的操作词替换判为重复", () => {
    const result = evaluateTitleSemanticDuplicate(
      "催娃定方向，还是等他自己想明白？",
      "催娃投简历，还是先定秋招方向？",
    );
    expect(result.duplicate).toBe(true);
    expect(result.reasons).toContain("家长催孩子先定求职方向的选择母题相同");
  });

  it("把催孩子投简历前先捋秋招方向的不同句式判为重复", () => {
    const result = evaluateTitleSemanticDuplicate(
      "催娃投简历，还是先定秋招方向？",
      "总催娃投简历，不如先捋秋招方向",
    );
    expect(result.duplicate).toBe(true);
    expect(result.reasons).toContain("家长催孩子先定求职方向的选择母题相同");
  });

  it("把孩子留学后秋招投什么的焦虑换词判为重复", () => {
    const result = evaluateTitleSemanticDuplicate(
      "娃留完学，连秋招投什么都犹豫",
      "供娃留完学，秋招方向他自己都懵",
    );
    expect(result.duplicate).toBe(true);
    expect(result.reasons).toContain("家长视角下留学后秋招方向焦虑的母题相同");
  });

  it("不会把留学家庭的秋招时间建议误判为方向焦虑重复", () => {
    expect(titlesAreSemanticDuplicates(
      "娃留完学，秋招前先理清时间线",
      "供娃留学回来，校招先补一段实习",
    )).toBe(false);
  });

  it("把待业后害怕接爸妈电话的表达也判为父母压力母题", () => {
    const result = evaluateTitleSemanticDuplicate(
      "花百万留学，不敢跟爸妈说秋招没方向",
      "海归待业，怕接爸妈的视频电话",
    );
    expect(result.duplicate).toBe(true);
    expect(result.reasons).toContain("父母压力下的求职困境母题相同");
  });

  it("把秋招不敢说只换倾诉对象的表达判为重复", () => {
    const result = evaluateTitleSemanticDuplicate(
      "留了学，连秋招投什么都不敢说",
      "留了学，连秋招投啥不敢跟室友说",
    );
    expect(result.duplicate).toBe(true);
    expect(result.reasons).toContain("留学求职中不敢说出口的困境母题相同");
  });

  it("把投递节奏错了白搭的开头换词判为重复", () => {
    const result = evaluateTitleSemanticDuplicate(
      "海归背景好？投错节奏全白搭",
      "早投晚投都一样？节奏错了白搭",
    );
    expect(result.duplicate).toBe(true);
    expect(result.reasons).toContain("招聘投递节奏错位母题相同");
  });

  it("把学历背景转向项目证据的怀旧换词判为重复", () => {
    const result = evaluateTitleSemanticDuplicate(
      "以前拼学校，现在拼岗位证据",
      "过去拼背景，现在拼项目表达",
    );
    expect(result.duplicate).toBe(true);
    expect(result.reasons).toContain("学历背景转向项目证据的怀旧母题相同");
  });

  it("把岗没选对归为方向错位，避免反认知题换词重复", () => {
    const result = evaluateTitleSemanticDuplicate(
      "以为海归吃香，投了才知道岗没选对",
      "以为海归好投，其实方向错了白搭",
    );
    expect(result.duplicate).toBe(true);
    expect(result.left.conflict).toBe("role_mismatch");
    expect(result.right.conflict).toBe("role_mismatch");
  });

  it("把目标岗与保底 offer 的二选一换词判为重复", () => {
    const result = evaluateTitleSemanticDuplicate(
      "死磕目标岗，还是先拿个offer保底？",
      "死磕对口岗，还是先接个offer？",
    );
    expect(result.duplicate).toBe(true);
    expect(result.reasons).toContain("目标岗位与保底 offer 的二选一母题相同");
  });

  it("把留当地和回国求职的前后换序判为重复", () => {
    const result = evaluateTitleSemanticDuplicate(
      "留当地，还是回国求职？",
      "回国求职，还是留在当地？",
    );
    expect(result.duplicate).toBe(true);
    expect(result.left.scenario).toBe("stay_or_return");
    expect(result.right.conflict).toBe("stay_or_return_choice");
  });

  it("把海归光环转向岗位或简历的怀旧改写判为重复", () => {
    const result = evaluateTitleSemanticDuplicate(
      "海归吃香那几年，如今还要看岗位",
      "当年海归吃香，现在先看简历匹配",
    );
    expect(result.duplicate).toBe(true);
    expect(result.reasons).toContain("海归光环转向求职准备的怀旧母题相同");
  });

  it("把过去看学校或学历、现在练面试的改写判为重复", () => {
    const result = evaluateTitleSemanticDuplicate(
      "以前拼学校，现在练面试",
      "以前看学历，现在练面试",
    );
    expect(result.duplicate).toBe(true);
    expect(result.reasons).toContain("学历转向面试准备的怀旧母题相同");
  });

  it("把当年录取、如今等面试的怀旧对照换词判为重复", () => {
    const result = evaluateTitleSemanticDuplicate(
      "当年收录取通知，现在等面试信",
      "当年收录取信多开心，现在等面试多揪心",
    );
    expect(result.duplicate).toBe(true);
    expect(result.reasons).toContain("当年录取、如今等面试的怀旧反差母题相同");
  });

  it("怀旧法去掉固定今昔外壳后，不会误杀不同生活物件与求职任务", () => {
    expect(titlesAreMethodAwareSemanticDuplicates(
      "nostalgia",
      "陪娃办交通卡，如今算通勤月成本",
      "陪娃改论文脚注，如今改简历要点",
    )).toBe(false);
  });

  it("怀旧法去掉固定外壳后，真正相同的社团经历转工作证据仍会拦截", () => {
    expect(titlesAreMethodAwareSemanticDuplicates(
      "nostalgia",
      "以前陪娃写社团职位，现在证工作结果",
      "陪娃写社团经历，如今证明工作结果",
    )).toBe(true);
  });

  it("不会把录取后的面试准备误判为等面试消息的怀旧对照", () => {
    expect(titlesAreSemanticDuplicates(
      "当年收录取通知，现在等面试信",
      "当年收到录取通知，现在开始练面试",
    )).toBe(false);
  });

  it("不同句式的岗位错位标题不被全历史语义规则过度拦截", () => {
    const result = evaluateTitleSemanticDuplicate(
      "花家里钱留学，投错岗不敢说",
      "内推不是捷径，投错岗白搭",
    );
    expect(result.duplicate).toBe(false);
  });

  it("岗位错位且共享“白搭”结果时，不允许只替换优势来源重新交付", () => {
    const result = evaluateTitleSemanticDuplicate(
      "内推不是捷径，投错岗白搭",
      "找不对岗，努力越多越白搭",
    );
    expect(result.duplicate).toBe(true);
    expect(result.reasons).toContain("岗位方向错位且结果表达相同");
  });

  it("把背景好却方向错的反认知判为同一母题", () => {
    const result = evaluateTitleSemanticDuplicate(
      "以为海归吃香，投了才知道岗没选对",
      "背景好不顶用，方向错了白搭",
    );
    expect(result.duplicate).toBe(true);
    expect(result.reasons).toContain("岗位方向错位的反认知母题相同");
  });

  it("把学历背景不等于秋招顺利的换词判为重复", () => {
    const result = evaluateTitleSemanticDuplicate(
      "总说学历重要，找不对岗全白搭",
      "留学背景好，未必秋招就顺",
    );
    expect(result.duplicate).toBe(true);
    expect(result.reasons).toContain("学历或留学背景不等于求职顺利的反认知母题相同");
  });

  it("不会把不同的留学生求职建议误判为学历反认知重复", () => {
    expect(titlesAreSemanticDuplicates(
      "留学生秋招前先查时间线",
      "回国求职前，先做岗位筛选",
    )).toBe(false);
  });

  it("允许同一业务下材料和冲突都不同的标题", () => {
    const first = "留学生秋招前先查时间线";
    const second = "回国求职前，先做岗位筛选";
    expect(titlesAreSemanticDuplicates(first, second)).toBe(false);
    expect(buildTitleSemanticSignature(first).scenario).toBe("recruiting_timeline");
    expect(buildTitleSemanticSignature(second).scenario).toBe("job_targeting");
  });

  it("盘点法剥离固定外壳后比较真正对象，不误伤不同对象", () => {
    expect(titleForMethodSemanticComparison(
      "inventory",
      "留学生求职，盘点4类入职认证材料",
    )).toBe("入职认证材料");
    expect(titlesAreMethodAwareSemanticDuplicates(
      "inventory",
      "留学生求职，盘点4类入职认证材料",
      "留学生求职，盘点3种群面核心角色",
    )).toBe(false);
  });

  it("盘点法同一对象只换数字仍判为重复", () => {
    expect(titlesAreMethodAwareSemanticDuplicates(
      "inventory",
      "秋招陪跑，盘点5项异地入职提前量",
      "秋招陪跑，盘点3项异地入职提前量",
    )).toBe(true);
  });

  it.each([
    [
      "human_pain",
      "中英简历对不上，不敢投心仪岗",
      "两版简历对不上，越投越心虚",
    ],
    [
      "human_pain",
      "猎头来电时我正主持团队会",
      "接猎头电话时我正开团队会",
    ],
    [
      "human_pain",
      "被董事会夸了反倒想走",
      "董事会夸完我更想换方向",
    ],
    [
      "nostalgia",
      "以前陪娃写社团职位，现在证工作结果",
      "陪娃写社团经历，如今证明工作结果",
    ],
    [
      "scarce_material",
      "跨境联系卡，保证HR能找到你",
      "跨境联系核对卡，确保能被找到",
    ],
    [
      "inventory",
      "盘点中英表达样本，适配不同岗",
      "盘点4类中英汇报表达样本",
    ],
    [
      "contrarian",
      "校友认识多，反而不清楚岗日常",
      "认识校友多，反倒不清楚岗位日常",
    ],
    [
      "human_pain",
      "家里托关系，我更不敢说不",
      "家里托关系，反而更难拒绝",
    ],
    [
      "tug_of_war",
      "做专业岗还是转综合经营岗",
      "做专业负责人还是转经营岗",
    ],
    [
      "tug_of_war",
      "岗位名好听，还是工作内容扎实好",
      "岗位名头响还是实际内容更扎实",
    ],
    [
      "contrarian",
      "行业经验深，跨岗更要拿证据",
      "行业经验深，跨岗反倒要补证据",
    ],
    [
      "contrarian",
      "岗位名称好听，反倒内容不对口",
      "岗位名头响还是内容扎实更重要",
    ],
    [
      "contrarian",
      "模拟面试多，娃回答反而不自然了",
      "孩子面试练得多，未必答得更自然",
    ],
    [
      "scarce_material",
      "面试反问题库，核验岗位和经理",
      "盘点4类面试反问实用方向",
    ],
    [
      "inventory",
      "校友访谈题单，验证岗位日常",
      "盘点5个校友访谈验证问题",
    ],
    [
      "inventory",
      "薪酬条款比较尺，统一底薪奖金口径",
      "盘点3类底薪奖金签字费口径",
    ],
    [
      "superlative",
      "招聘官触点页，排好跟进节奏",
      "招聘官跟进最易失礼的间隔",
    ],
    [
      "inventory",
      "留学生求职拒信要记这些字段",
      "拒信别删，先盘原因记录字段",
    ],
    [
      "scarce_material",
      "写简历前，先盘协作故事素材",
      "协作故事拆解卡，补项目细节用",
    ],
    [
      "scarce_material",
      "送监管风险问题库，核验新赛道用",
      "盘点：监管变化的3类方向风险",
    ],
    [
      "inventory",
      "高管背调最容易失效的证明人",
      "盘点：背调证明人的可用性",
    ],
    [
      "scarce_material",
      "顾问合同最易失控的责任边界",
      "送顾问责任边界单，防交付失控",
    ],
    [
      "inventory",
      "创业最易高估的首批客户来源",
      "盘点：首批客户线索的来源",
    ],
    [
      "scarce_material",
      "盘点个人品牌可带走的资产",
      "送个人品牌资产表，分清能带走什么",
    ],
    [
      "human_pain",
      "HR问入职日，娃还没搞定答辩",
      "招聘官问入职日，孩子还没答辩",
    ],
    [
      "human_pain",
      "猎头来电，正开部门会不敢接",
      "猎头来电，我却不敢接",
    ],
    [
      "inventory",
      "盘点家庭现金流，算换挡空窗期",
      "盘点家庭现金流，扛得住空窗吗",
    ],
    [
      "scarce_material",
      "送风险红旗卡，筛方向暗坑",
      "送风险红旗卡，筛转型暗坑",
    ],
    [
      "tug_of_war",
      "要高头衔，还是要完整利润责任",
      "高头衔低权，还是低头衔高权",
    ],
    [
      "human_pain",
      "团队离不开你，市场没回应",
      "旧团队缺你，外头没回音",
    ],
    [
      "contrarian",
      "决策快的人，转型更容易漏事",
      "决策快，转型反倒容易漏变量",
    ],
    [
      "superlative",
      "留学生求职签证最易看错的到期日",
      "签证最易看错准确到期日",
    ],
    [
      "superlative",
      "试错窗口最耗人的隐形消耗",
      "试错窗口最容易耗在方向摇摆",
    ],
    [
      "human_pain",
      "学校邮箱快停，娃还有申请没结束",
      "孩子学校邮箱快停，申请还没结束",
    ],
    [
      "human_pain",
      "租约快到，我却不知搬哪座城",
      "投了好多城，没一座想真落脚",
    ],
    [
      "scarce_material",
      "测评设备单，提前排查软硬件",
      "在线测评设备单，先查软硬件",
    ],
    [
      "scarce_material",
      "送家庭约束单，划换挡承受边界",
      "盘点家庭约束项，看换挡承受力",
    ],
    [
      "scarce_material",
      "送方向决策坐标，筛适配赛道",
      "送行业适配坐标，定下一步方向",
    ],
    [
      "inventory",
      "盘点失败验尸维度，避换挡踩坑",
      "盘点失败风险点，做前置验尸判断",
    ],
    [
      "human_pain",
      "客户只认公司，个人价值怎么算",
      "客户只认公司，我换赛道没人理",
    ],
    [
      "superlative",
      "新岗最易误判的决策权匹配",
      "岗位错配最隐蔽的一项权责信号",
    ],
    [
      "contrarian",
      "管理半径大，亲解决问题更慢",
      "管理半径大，解决问题未必快",
    ],
    [
      "nostalgia",
      "以前看客户满意度，现在算回头客多少",
      "以前看客户满意度，如今看个人复购率",
    ],
  ])("把%s方法的线上同题样本判为重复：%s / %s", (methodId, left, right) => {
    expect(nativeTitleSemanticTopicKeys(methodId, left).length).toBeGreaterThan(0);
    expect(titlesAreMethodAwareSemanticDuplicates(methodId, left, right)).toBe(true);
  });

  it("不会把对象不同的资料和盘点标题误判成同题", () => {
    expect(titlesAreMethodAwareSemanticDuplicates(
      "scarce_material",
      "跨境联系核对卡，确保能被找到",
      "跨境税务问题单，帮你比两地选择",
    )).toBe(false);
    expect(titlesAreMethodAwareSemanticDuplicates(
      "inventory",
      "盘点中英表达样本，适配不同岗",
      "盘点3段利益相关方协作故事",
    )).toBe(false);
  });
});
