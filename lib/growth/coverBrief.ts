export interface CoverBriefInput {
  title: string;
  coverText?: string;
  targetUser?: string;
  contentType?: "diagnostic" | "tool" | "story";
  testVariable?: string;
  styleHint?: string;
  buyerC?: boolean;
  caseMode?: "真实案例" | "情景演绎";
  caseMaterial?: string;
}

export interface CoverBrief {
  coverText: string;
  scene: string;
  visualStyle: string;
  negativePrompt: string;
  imagePrompt: string;
  overlayGuidance: string;
}

function sceneForType(contentType?: CoverBriefInput["contentType"]) {
  if (contentType === "tool") {
    return "俯拍平铺（flat lay）真实办公桌面，摊开一张手写判断表，旁边放着电脑、彩色便签、马克笔和一杯咖啡，构图干净有呼吸感";
  }
  if (contentType === "story") {
    return "清晨咖啡馆或家中书桌旁的生活感场景，一本打开的笔记本正在复盘，暖光洒在桌面，画面有真实故事感和代入感";
  }
  return "职场人在明亮通透的桌面前做决策，白纸上写着目标客户和下一步动作，笔记本电脑虚化在后，画面清爽有生活气息";
}

const VIRAL_BASE =
  "小红书爆款笔记封面风格，明亮通透高饱和，奶油色/莫兰迪高级配色，ins 风真实生活质感，光线柔和有氛围感，构图简洁有留白，高清精致";

const VIRAL_LAYOUT =
  "版式为小红书爆款封面：顶部或中部预留大面积留白放中文大字标题，标题加粗醒目，关键词用亮色色块或荧光笔高亮，整体像真人博主手作封面，有点击欲";

export function buildCoverBrief(input: CoverBriefInput): CoverBrief {
  const coverText = (input.coverText || input.title).slice(0, 18);

  if (input.buyerC) {
    const fictional = input.caseMode !== "真实案例";
    const material = input.caseMaterial?.trim() || "留学生家庭的两段求职经历";
    const scene =
      input.styleHint === "结果对照版"
        ? "同一画面做左右阶段对照：左侧是成年留学生收到求职结果后与家长在家中看手机，右侧是另一名成年留学生拿材料走向校园招聘入口；两侧人物和光线连贯，像一个家庭两个阶段的纪实抓拍"
        : "留学生家长站在校园招聘入口外，从家长视角看到一名成年留学生拿着文件夹走向会场，背景有人群、展架和无品牌招聘横幅，有真实现场感";
    const visualStyle =
      "中国留学生家庭视角的手机纪实摄影，自然光，轻微生活化构图，不过度精修，人物为成年人；上方和下方保留足够干净空间供前端叠加中文标题与状态角标";
    const negativePrompt = fictional
      ? "不要任何文字、汉字、字母、数字、标题、Logo或水印；不要真实企业或学校标识；不要Offer、合同、邮件、印章、编号、邮箱或证件；不要儿童形象；不要机构宣传照；不要卡通；不要畸形手部"
      : "不要任何文字、汉字、字母、数字、标题、Logo或水印；不要补造案例素材中没有的企业、岗位或结果；不要伪造Offer、合同、邮件、印章、编号、邮箱或证件；不要儿童形象；不要畸形手部";
    return {
      coverText,
      scene,
      visualStyle,
      negativePrompt,
      imagePrompt: `${scene}。${visualStyle}。案例背景仅用于把握情绪与人物阶段：${material}。${
        fictional
          ? "这是完全虚构的通用招聘环境，不出现任何真实企业、学校或机构可识别元素。"
          : "只呈现通用公开招聘现场，不让生成图承担结果真实性证明。"
      } 画面本身不要生成任何文字、Logo或文件细节，9:16竖版。`,
      overlayGuidance: fictional
        ? "前端叠加两行主标题，并在左上角固定叠加“情景演绎 / 示意图”角标。"
        : "前端叠加两行主标题；生成图只负责现场氛围，真实企业或结果细节由用户自己的公开素材承接。",
    };
  }

  const scene = sceneForType(input.contentType);
  const visualStyle = `${VIRAL_BASE}。${VIRAL_LAYOUT}`;
  const negativePrompt =
    "不要卡通，不要赛博朋克，不要低分辨率，不要杂乱背景，不要廉价模板感，不要无意义渐变，不要玄学符号，不要现金和暴富暗示，不要水印，不要多余乱码文字，不要畸形手部";
  const audience = input.targetUser ? `目标用户：${input.targetUser}。` : "";
  const variable = input.testVariable ? `本图验证变量：${input.testVariable}。` : "";
  const styleHint = input.styleHint ? `风格补充：${input.styleHint}。` : "";

  return {
    coverText,
    scene,
    visualStyle,
    negativePrompt,
    imagePrompt: `${scene}。${visualStyle}。${audience}${variable}${styleHint}画面适合叠加中文封面句「${coverText}」，为标题预留上方或中部留白，9:16 竖版。`,
    overlayGuidance: `主标题不超过 12 字，建议使用「${coverText}」，加粗放大、关键词用亮色高亮；副标题补充目标用户或痛点场景，制造点击欲。`,
  };
}
