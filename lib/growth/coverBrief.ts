export interface CoverBriefInput {
  title: string;
  coverText?: string;
  targetUser?: string;
  contentType?: "diagnostic" | "tool" | "story";
  testVariable?: string;
  styleHint?: string;
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

// 小红书爆款封面的通用视觉基调：明亮通透、奶油/莫兰迪高级配色、ins 风、真实生活质感
const VIRAL_BASE =
  "小红书爆款笔记封面风格，明亮通透高饱和，奶油色/莫兰迪高级配色，ins 风真实生活质感，光线柔和有氛围感，构图简洁有留白，高清精致";

// 爆款排版指令：大字标题党 + 关键词高亮色块 + 强钩子
const VIRAL_LAYOUT =
  "版式为小红书爆款封面：顶部或中部预留大面积留白放中文大字标题，标题加粗醒目，关键词用亮色色块或荧光笔高亮，整体像真人博主手作封面，有点击欲";

export function buildCoverBrief(input: CoverBriefInput): CoverBrief {
  const coverText = (input.coverText || input.title).slice(0, 18);
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
