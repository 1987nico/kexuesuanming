import { describe, expect, it } from "vitest";
import { buildTopicPoolUserPrompt } from "./agents";
import { TITLE_METHOD_BY_ID } from "./methods";
import type { BenchmarkStructureCard, TopicSourceSnapshot } from "./types";

const source: TopicSourceSnapshot = {
  id: "source-1",
  method_id: "viral_framework",
  platform: "小红书",
  author: "作者",
  original_title: "你缺的不是客户，是跟进客户的能力",
  original_url: "https://example.com/note",
  published_at: "2026-07-21T00:00:00.000Z",
  heat_snapshot: "互动1万",
  collected_at: "2026-07-22T00:00:00.000Z",
  migration_note: "迁移‘缺的不是A，是B’冲突结构",
  link_status: "accessible",
  verified_by_operator: true,
  freshness: "within_72h",
};

const structureCard: BenchmarkStructureCard = {
  id: "card-1",
  account_id: "account-1",
  business_line: "executive",
  persona: "buyer",
  method_id: "viral_framework",
  source_id: source.id,
  source_url: source.original_url,
  source_title: source.original_title,
  source_author: source.author,
  sentence_structure: "你缺的不是A，而是B",
  conflict_structure: "表面缺少机会，实际缺少持续推进能力",
  audience_situation: "已经在转型，但行动很多仍没有明确进展",
  emotional_hook: "指出努力方向可能错了",
  promised_result: "帮助读者识别真正阻碍转型的变量",
  inheritable_element: "先否定表层问题，再指出深层能力",
  replacement_requirement: "把客户与跟进能力替换为中高管转型中的真实变量",
  semantic_slots: {
    audience_or_role: "",
    unusual_action_or_method: "持续推进与跟进",
    scene_or_channel: "",
    goal_or_outcome: "识别真正需要的能力",
    relationship: "否定表层问题，指出真正关键变量",
    required_slot_keys: ["relationship", "unusual_action_or_method"],
  },
  semantic_status: "ready",
  forbidden_copy_elements: ["客户", "跟进客户"],
  source_fit_status: "passed",
  source_fit_reason: "爆款框架可迁移到职业决策场景",
  status: "locked",
  structure_version: "v3_8",
  generated_at: "2026-07-22T01:00:00.000Z",
  expires_at: "2026-07-23T01:00:00.000Z",
};

describe("来源型标题生成合同", () => {
  it("留学生家长标题规则要求在标题本身写出亲子关系", () => {
    const prompt = buildTopicPoolUserPrompt({
      week: 1,
      targetUser: "准备秋招的留学生与家长",
      coreProblem: "求职方向与招聘节奏不清晰",
      persona: "buyer",
      methods: [TITLE_METHOD_BY_ID.human_pain],
      generationMode: "default",
      context: {
        businessLine: "留学生求职辅导",
        oneLiner: "陪娃闯秋招的留学生家长真实记录",
      },
    });

    expect(prompt).toContain("每一个标题本身都必须包含孩子/娃/家长/我家/陪孩子/陪娃/儿女");
    expect(prompt).toContain("不能把家长身份只留给正文承诺");
  });

  it("每个模型候选标题必须携带自己独立的正文承诺", () => {
    const prompt = buildTopicPoolUserPrompt({
      week: 1,
      targetUser: "转型中的中高管",
      coreProblem: "方向不清晰",
      persona: "buyer",
      methods: [TITLE_METHOD_BY_ID.human_pain],
      generationMode: "default",
    });

    expect(prompt).toContain('"title_candidates"');
    expect(prompt).toContain("候选标题与正文承诺必须一一绑定");
    expect(prompt).not.toContain('"alternative_titles"');
  });

  it("送稀缺资料必须轮换资料载体和决策任务，不能反复生成表格清单", () => {
    const prompt = buildTopicPoolUserPrompt({
      week: 1,
      targetUser: "准备回国求职的留学生",
      coreProblem: "岗位方向和投递优先级不清晰",
      persona: "merchant",
      methods: [TITLE_METHOD_BY_ID.scarce_material],
      generationMode: "default",
    });

    expect(prompt).toContain("三种不同的资料载体与决策任务");
    expect(prompt).toContain("岗位JD拆解卡");
    expect(prompt).toContain("投递结果复盘页");
    expect(prompt).not.toContain("投递漏斗复盘页");
    expect(prompt).toContain("不要连续输出“某某表/清单/路线图”");
  });

  it("标题提示词只带最新160条历史，不会误把最旧标题当作近期禁区", () => {
    const newestFirstHistory = Array.from({ length: 161 }, (_, index) => (
      `最新历史标题${String(index + 1).padStart(3, "0")}`
    ));
    const prompt = buildTopicPoolUserPrompt({
      week: 1,
      targetUser: "转型中的中高管",
      coreProblem: "方向不清晰",
      persona: "buyer",
      methods: [TITLE_METHOD_BY_ID.human_pain],
      generationMode: "default",
      excludeTitles: newestFirstHistory,
    });

    expect(prompt).toContain("最新历史标题001");
    expect(prompt).toContain("最新历史标题160");
    expect(prompt).not.toContain("最新历史标题161");
  });

  it("定向补题优先保留本轮刚被拒绝的标题，不会被长历史挤出窗口", () => {
    const newestFirstHistory = Array.from({ length: 180 }, (_, index) => (
      `历史标题${String(index + 1).padStart(3, "0")}`
    ));
    const prompt = buildTopicPoolUserPrompt({
      week: 1,
      targetUser: "转型中的中高管",
      coreProblem: "方向不清晰",
      persona: "buyer",
      methods: [TITLE_METHOD_BY_ID.human_pain],
      generationMode: "default",
      excludeTitles: newestFirstHistory,
      priorityExcludeTitles: ["刚被拒绝的重复标题"],
    });

    expect(prompt).toContain("刚被拒绝的重复标题");
    expect(prompt).toContain("历史标题001");
    expect(prompt).not.toContain("历史标题160");
  });

  it("定向补题可读取超过近5批的母题轨迹", () => {
    const prompt = buildTopicPoolUserPrompt({
      week: 1,
      targetUser: "转型中的中高管",
      coreProblem: "方向不清晰",
      persona: "buyer",
      methods: [TITLE_METHOD_BY_ID.human_pain],
      generationMode: "default",
      diversityHistory: [{
        method_id: "human_pain",
        sentence_frame: "第八批旧句式",
        mother_topic_key: "第八批旧母题",
        material_signature: "第八批旧素材",
        batch_index: 7,
      }],
      diversityHistoryBatchLimit: 20,
    });

    expect(prompt).toContain("第八批旧句式");
    expect(prompt).toContain("第八批旧母题");
    expect(prompt).toContain("第八批旧素材");
  });

  it("标题生成阶段只接收锁定结构卡，不再看到或解释原题", () => {
    const prompt = buildTopicPoolUserPrompt({
      week: 1,
      targetUser: "转型中的中高管",
      coreProblem: "方向不清晰",
      persona: "buyer",
      methods: [TITLE_METHOD_BY_ID.viral_framework],
      generationMode: "default",
      sources: [source],
      structureCards: [structureCard],
    });
    expect(prompt).toContain("来源型方法已经在上一步完成母题拆解");
    expect(prompt).toContain("只能使用“已锁定结构卡”生成");
    expect(prompt).toContain(structureCard.sentence_structure);
    expect(prompt).toContain(structureCard.replacement_requirement);
    expect(prompt).toContain("semantic_slots");
    expect(prompt).toContain("required_slot_keys");
    expect(prompt).not.toContain(source.original_title);
    expect(prompt).not.toContain('"source_usage"');
  });

  it("拔河法会根据历史标题提供尚未使用的具体取舍轴", () => {
    const prompt = buildTopicPoolUserPrompt({
      week: 1,
      targetUser: "关注孩子就业结果的留学生家长",
      coreProblem: "孩子回国求职时的路径选择",
      persona: "buyer",
      methods: [TITLE_METHOD_BY_ID.tug_of_war],
      generationMode: "default",
      diversityHistory: [
        {
          method_id: "tug_of_war",
          title: "孩子留英，还是回国求职？",
          batch_index: 0,
        },
        {
          method_id: "tug_of_war",
          title: "先补实习，还是直接冲秋招？",
          batch_index: 1,
        },
      ],
      // 生产接口传入的是稳定业务编码，不是页面展示名称。
      context: { businessLine: "overseas_student" },
    });

    expect(prompt).toContain("本轮强制使用的未用取舍轴");
    expect(prompt).toContain("喜欢的城市 vs 更匹配的岗位");
    expect(prompt).toContain("热门行业 vs 更擅长的职能");
    expect(prompt).toContain("不得再回到历史里已经出现的地区去留");
  });

  it("怀旧法会排除历史已用今昔坐标并分配新的具体物件与任务", () => {
    const prompt = buildTopicPoolUserPrompt({
      week: 1,
      targetUser: "关注孩子就业结果的留学生家长",
      coreProblem: "孩子回国求职时的路径选择",
      persona: "buyer",
      methods: [TITLE_METHOD_BY_ID.nostalgia],
      generationMode: "default",
      diversityHistory: [
        {
          method_id: "nostalgia",
          title: "以前写个人陈述，现在陪娃练自我介绍",
          batch_index: 0,
        },
        {
          method_id: "nostalgia",
          title: "当年找教授写推荐信，如今帮娃备背调",
          batch_index: 1,
        },
      ],
      // 生产接口传入的是稳定业务编码，不是页面展示名称。
      context: { businessLine: "overseas_student" },
    });

    expect(prompt).toContain("本轮强制使用的未用今昔坐标");
    expect(prompt).not.toContain("过去写个人陈述，如今练面试自我介绍");
    expect(prompt).not.toContain("过去找教授写推荐信，如今准备背调联系人");
    expect(prompt).toContain("以前陪孩子排课程表，现在陪他排网申截止日");
    expect(prompt).toContain("以前陪孩子盯成绩单，现在陪他整理项目证据");
  });

  it("上一轮失败候选也会占用角度，下一次不会原路重试", () => {
    const prompt = buildTopicPoolUserPrompt({
      week: 1,
      targetUser: "关注孩子就业结果的留学生家长",
      coreProblem: "孩子回国求职时的路径选择",
      persona: "buyer",
      methods: [TITLE_METHOD_BY_ID.tug_of_war, TITLE_METHOD_BY_ID.nostalgia],
      generationMode: "default",
      excludeTitles: [
        "娃去喜欢的城，还是选匹配的岗",
        "娃挤热门行业，还是走擅长的职能",
        "娃看起薪高低，还是看成长空间",
        "以前陪娃写陈述，现在陪练自我介绍",
        "以前找教授写推，现在备背调联系人",
        "以前排课程表，现在排网申截止日",
      ],
      context: { businessLine: "overseas_student" },
    });

    expect(prompt).toContain("公司名气 vs 直属上级和带教");
    expect(prompt).toContain("轮岗管培 vs 专业职能深耕");
    expect(prompt).toContain("以前陪孩子盯成绩单，现在陪他整理项目证据");
    expect(prompt).not.toContain("1. 喜欢的城市 vs 更匹配的岗位");
    expect(prompt).not.toContain("1. 以前陪孩子写个人陈述");
  });

  it("盘点法会跳过失败批次用过的对象，分配新的具体盘点对象", () => {
    const prompt = buildTopicPoolUserPrompt({
      week: 1,
      targetUser: "准备秋招的留学生与家长",
      coreProblem: "求职方向与招聘节奏不清晰",
      persona: "merchant",
      methods: [TITLE_METHOD_BY_ID.inventory],
      generationMode: "default",
      excludeTitles: [
        "留学生求职，盘点3类跨时区面试冲突",
        "秋招陪跑，盘点4个工签衔接节点",
        "留学生求职，盘点3类背调联系人风险",
      ],
      context: { businessLine: "overseas_student" },
    });

    expect(prompt).toContain("本轮强制使用的未用盘点对象");
    expect(prompt).not.toContain("1. 跨时区面试时段冲突");
    expect(prompt).not.toContain("1. 毕业签证与工签衔接节点");
    expect(prompt).not.toContain("1. 背调联系人可用性");
    expect(prompt).toContain("异地入职搬迁提前量");
    expect(prompt).toContain("入职证件与学历认证材料");
    expect(prompt).toContain("评估中心小组任务角色");
  });

  it("反认知会跳过反复使用的学历实习母题，分配未用优势与隐藏代价", () => {
    const prompt = buildTopicPoolUserPrompt({
      week: 1,
      targetUser: "关注孩子就业结果的留学生家长",
      coreProblem: "孩子回国求职时的路径选择",
      persona: "buyer",
      methods: [TITLE_METHOD_BY_ID.contrarian],
      generationMode: "default",
      diversityHistory: [
        {
          method_id: "contrarian",
          title: "孩子证书很多，却拿不出工作成果证据",
          batch_index: 0,
        },
        {
          method_id: "contrarian",
          title: "孩子英语流利，面试却说不清业务判断",
          batch_index: 1,
        },
        {
          method_id: "contrarian",
          title: "孩子成绩高，却讲不出协作故事",
          batch_index: 2,
        },
      ],
      context: { businessLine: "overseas_student" },
    });

    expect(prompt).toContain("本轮强制使用的未用反认知关系");
    expect(prompt).not.toContain("1. 证书数量多 → 缺少工作成果证据");
    expect(prompt).not.toContain("1. 英语流利 → 说不清业务判断");
    expect(prompt).not.toContain("1. 成绩高 → 缺少协作故事");
    expect(prompt).toContain("项目多 → 讲不清个人贡献");
    expect(prompt).toContain("社团头衔高 → 证明不了岗位胜任");
    expect(prompt).toContain("投递很早 → 没核对招聘批次");
  });

  it("行业痛点、稀缺资料和极限词也会按历史轮换具体现场、任务与风险", () => {
    const prompt = buildTopicPoolUserPrompt({
      week: 1,
      targetUser: "准备秋招的留学生与家长",
      coreProblem: "求职方向与招聘节奏不清晰",
      persona: "expert",
      methods: [
        TITLE_METHOD_BY_ID.human_pain,
        TITLE_METHOD_BY_ID.scarce_material,
        TITLE_METHOD_BY_ID.superlative,
      ],
      generationMode: "default",
      diversityHistory: [
        { method_id: "human_pain", title: "申请系统状态一直不更新", batch_index: 0 },
        { method_id: "human_pain", title: "拒信到邮箱，我却不敢点开", batch_index: 1 },
        { method_id: "human_pain", title: "室友讨论Offer时，我只想沉默", batch_index: 2 },
        { method_id: "scarce_material", title: "跨时区面试排期表，直接用", batch_index: 0 },
        { method_id: "scarce_material", title: "工签衔接矩阵，先筛可投岗位", batch_index: 1 },
        { method_id: "scarce_material", title: "背调联系人可用表", batch_index: 2 },
        { method_id: "superlative", title: "最容易错过的跨时区面试确认", batch_index: 0 },
        { method_id: "superlative", title: "最隐蔽的工签资格误读", batch_index: 1 },
        { method_id: "superlative", title: "最容易失效的背调联系人", batch_index: 2 },
      ],
      context: { businessLine: "overseas_student" },
    });

    expect(prompt).toContain("本轮强制使用的未用痛点现场");
    expect(prompt).toContain("毕业典礼临近仍说不清去向");
    expect(prompt).toContain("租约到期却不知道搬去哪座城");
    expect(prompt).toContain("本轮强制使用的未用资料任务");
    expect(prompt).toContain("异地入职成本计算页");
    expect(prompt).toContain("学历认证材料包");
    expect(prompt).toContain("本轮强制使用的未用高代价风险");
    expect(prompt).toContain("最容易低估的异地搬迁成本");
    expect(prompt).toContain("最容易拖延入职的认证材料");
  });

  it("行业痛点会把同一现场的自然改写视为已经使用", () => {
    const prompt = buildTopicPoolUserPrompt({
      week: 1,
      targetUser: "准备秋招的留学生与家长",
      coreProblem: "求职方向与招聘节奏不清晰",
      persona: "expert",
      methods: [TITLE_METHOD_BY_ID.human_pain],
      generationMode: "default",
      diversityHistory: [
        { method_id: "human_pain", title: "申请页卡着不动，不敢刷新怕白等", batch_index: 0 },
        { method_id: "human_pain", title: "拒信躺邮箱，指尖悬着不敢点", batch_index: 1 },
        { method_id: "human_pain", title: "室友聊Offer，我假装忙低头", batch_index: 2 },
        { method_id: "human_pain", title: "毕业快到了，反而更焦虑", batch_index: 3 },
      ],
      context: { businessLine: "overseas_student" },
    });

    expect(prompt).not.toContain("申请系统状态一直不更新");
    expect(prompt).not.toContain("拒信到邮箱却不敢点开");
    expect(prompt).not.toContain("室友讨论Offer时选择沉默");
    expect(prompt).not.toContain("毕业典礼临近仍说不清去向");
    expect(prompt).toContain("租约到期却不知道搬去哪座城");
    expect(prompt).toContain("父母问回程票却不敢确定日期");
    expect(prompt).toContain("导师问毕业计划只能含糊回答");
  });

  it("来源存在但没有锁定结构卡时，明确禁止生成该方法标题", () => {
    const prompt = buildTopicPoolUserPrompt({
      week: 1,
      targetUser: "转型中的中高管",
      coreProblem: "方向不清晰",
      persona: "buyer",
      methods: [TITLE_METHOD_BY_ID.viral_framework],
      generationMode: "default",
      sources: [source],
      structureCards: [],
    });
    expect(prompt).toContain("没有锁定结构卡；不得为它生成标题");
    expect(prompt).not.toContain(source.original_title);
  });
});
