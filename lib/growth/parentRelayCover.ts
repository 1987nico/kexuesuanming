import { PARENT_RELAY_IMAGE_LABEL } from "./buyerCStrategy";

export interface ParentRelayCoverFacts {
  venueName: string;
  venueDetail: string;
  recruitingCompany: string;
  recruitmentEvent: string;
  candidateNumber: string;
  queueRoom: string;
  candidateGender: "男性" | "女性";
  candidateClothing: string;
  handheldItems: string;
  offerCompany: string;
  offerRole: string;
  offerCity: string;
  offerSalary: string;
  headlineLines: [string, string];
}

const FICTIONAL_ENTITY_PATTERN =
  /[\p{Script=Han}A-Za-z0-9·]{2,24}(?:大学|学院|人才中心|就业中心|会展中心|集团|科技|银行|能源|公司)（虚构）/gu;

function fictionalEntities(source: string) {
  const markers = [
    "我们到了",
    "我们到",
    "我站在",
    "老二在",
    "老大在",
    "他收到了",
    "她收到了",
    "收到了",
    "收到",
    "拿到了",
    "拿到",
    "到了",
    "站在",
  ];
  const cleaned = (source.match(FICTIONAL_ENTITY_PATTERN) ?? []).map((raw) => {
    let entity = raw;
    for (const marker of markers) {
      const index = entity.lastIndexOf(marker);
      if (index >= 0) entity = entity.slice(index + marker.length);
    }
    return entity;
  });
  return Array.from(new Set(cleaned));
}

function firstMatch(source: string, pattern: RegExp, fallback: string) {
  return source.match(pattern)?.[1]?.trim() || fallback;
}

function entityFromSegment(segment: string, category: "venue" | "company") {
  const entities = fictionalEntities(segment);
  return entities.find((entity) =>
    category === "venue"
      ? /大学|学院|人才中心|就业中心|会展中心/u.test(entity)
      : /集团|科技|银行|能源|公司/u.test(entity),
  );
}

function normalizeNumber(raw: string) {
  return raw.replace(/^第/u, "").replace(/号.*$/u, "").trim();
}

export function extractParentRelayCoverFacts(input: {
  body?: string;
  coverText?: string;
}): ParentRelayCoverFacts {
  const body = input.body?.trim() || "";
  const entities = fictionalEntities(body);
  const venues = entities.filter((entity) => /大学|学院|人才中心|就业中心|会展中心/u.test(entity));
  const companies = entities.filter((entity) => /集团|科技|银行|能源|公司/u.test(entity));
  const quotedEvents = Array.from(body.matchAll(/「([^」]{4,80})」/gu)).map((match) => match[1]);
  const recruitmentEventSegment =
    quotedEvents.find((segment) => /招聘|终面|管培生|校招/u.test(segment)) || "";
  const recruitingCompany =
    entityFromSegment(recruitmentEventSegment, "company") || companies[0] || "锦岳消费科技（虚构）";

  const offerContext =
    body.match(/(?:收到|拿到)[^。]{0,100}(?:Offer|录用通知)/iu)?.[0] ||
    body.match(/(?:Offer|录用通知)[^。]{0,100}/iu)?.[0] ||
    "";
  const offerCompany =
    entityFromSegment(offerContext, "company") ||
    companies.find((company) => company !== recruitingCompany) ||
    companies[0] ||
    "澄海数字科技（虚构）";

  const venueName = venues[0] || "上海国际青年人才中心（虚构）";
  const venueDetail = firstMatch(
    body,
    /(?:到|站在|到了)[^。]{0,45}?((?:[A-Z]座)?(?:三楼|三层|二楼|二层|四楼|四层|B座三层|就业中心B座三层))/u,
    /人才中心/u.test(venueName) ? "三楼招聘入口" : "就业中心B座三层",
  );
  const rawCandidateNumber = firstMatch(
    body,
    /((?:第)?[A-Z]?\d{1,3}号)(?:胸牌)?/u,
    "A18",
  );
  const candidateNumber = normalizeNumber(rawCandidateNumber) || "A18";
  const queueRoom = firstMatch(
    body,
    /((?:[A-Z]\d{3})(?:厅)?|终面室\d+-\d+|面试间\d+-\d+)/u,
    /终面/u.test(body) ? "终面室3-2" : "招聘会场",
  );

  const salaryMatch = body.match(/年薪(?:为|：|:)?\s*(\d+(?:\.\d+)?)\s*万(?:元)?/u);
  const offerSalary = salaryMatch ? `${salaryMatch[1]}万元` : "34.2万元";
  const roleMatches = Array.from(
    body.matchAll(/(?:北京|上海|杭州|深圳|广州|济南|南京|成都|武汉|青岛)?([\p{Script=Han}A-Za-z0-9+#/\-]{2,18}(?:策略岗|分析岗|品牌岗|运营岗|管培生|工程师|分析师|产品经理))/gu),
  ).map((match) => match[1]);
  const offerRole = roleMatches[0] || "用户策略岗";
  const offerCity = firstMatch(offerContext || body, /(北京|上海|杭州|深圳|广州|济南|南京|成都|武汉|青岛)/u, "杭州");
  const candidateGender: ParentRelayCoverFacts["candidateGender"] =
    /女儿|她|妹妹/u.test(body) ? "女性" : "男性";
  const candidateClothing = /西装/u.test(body) ? "简洁深色西装" : "简洁商务装";
  const handheldItems = /蓝色和透明文件袋/u.test(body)
    ? "蓝色与透明两份文件袋"
    : /蓝色和粉色|蓝、透明|两版简历/u.test(body)
      ? "蓝色与粉色两份文件袋"
      : "两份不同颜色的简历文件袋";
  const recruitmentEvent =
    recruitmentEventSegment ||
    `${recruitingCompany} ${/终面/u.test(body) ? "2027届海外管培生终面" : "2027届留学生招聘会"}`;
  const stageLine = /终面/u.test(body)
    ? "老二刚进终面"
    : /招聘会/u.test(body)
      ? "老二刚进招聘会"
      : "老二刚进秋招场";
  const resultLine = salaryMatch ? `老大已拿${salaryMatch[1]}万Offer` : "老大已拿心仪Offer";

  return {
    venueName,
    venueDetail,
    recruitingCompany,
    recruitmentEvent,
    candidateNumber,
    queueRoom,
    candidateGender,
    candidateClothing,
    handheldItems,
    offerCompany,
    offerRole,
    offerCity,
    offerSalary,
    headlineLines: [resultLine, stageLine],
  };
}

export function buildParentRelayImagePrompt(
  facts: ParentRelayCoverFacts,
  variant: string | undefined,
) {
  const composition =
    variant === "结果对照版"
      ? "采用略低机位的侧后方抓拍，成年孩子正在跨进玻璃门；前景左侧为系统叠加Offer邮件卡预留约30%无遮挡空间，右侧蓝色叫号屏区域清楚，建筑入口与人流形成真实透视。"
      : "采用家长站在后方约5米处的广角手机抓拍；成年孩子位于中下部偏右，完整背影和走路动作清楚，入口人流、折叠椅与签到桌丰富但不抢主体，前景左侧为系统叠加Offer邮件卡预留约25%无遮挡空间。";
  const scene = `${facts.venueName}的${facts.venueDetail}招聘入口，普通公共建筑玻璃门、米灰色石墙、灰色折叠椅、签到桌、矿泉水、自然求职者人流，墙面上方有空白建筑招牌区，入口上方有一条无字红色横幅，人物右侧有一块无字蓝色电子叫号屏。`;
  const visualStyle =
    "中国留学生家长视角的高质量写实手机纪实摄影，自然午后光线，轻微手持倾斜，构图不完全对称，曝光不完全均匀，边缘可有被截断的成年人路人；像家长在孩子进场前一秒临时拍下，不要影棚光、商业广告片质感、电影滤镜或过度精修。";
  const imagePrompt = `Use case: ads-marketing。Asset type: 小红书2:3竖版首图底图。根据“家长双线接力体”文章生成野生招聘现场抓拍。场景：${scene} 主体：一名二十多岁的中国${facts.candidateGender}留学生，穿${facts.candidateClothing}，背对镜头走向会场，手拿${facts.handheldItems}，不露脸、不摆拍。${composition} ${visualStyle} 画面必须为后续系统叠加“${facts.recruitmentEvent}”招聘横幅、“当前叫号 ${facts.candidateNumber} / ${facts.queueRoom}”叫号屏、${facts.offerCompany}脱敏Offer邮件和底部两行大标题预留清楚、互不遮挡的空间。画面本身不要生成任何文字、汉字、字母、数字、Logo、邮件、证件或水印。所有人物必须为成年人。`;
  const negativePrompt =
    "不要任何文字、汉字、字母、数字、标题、Logo或水印；不要真实企业或学校标识；不要Offer、合同、邮件、印章、编号、邮箱或证件；不要AI感人脸、正脸特写、摆拍、奢华会场、空白展厅、未成年人、卡通、畸形手部、过度电影感";

  return {
    imageLabel: PARENT_RELAY_IMAGE_LABEL,
    scene,
    visualStyle,
    imagePrompt,
    negativePrompt,
  };
}
