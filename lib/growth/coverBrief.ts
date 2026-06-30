export interface CoverBriefInput {
  title: string;
  coverText?: string;
  targetUser?: string;
  contentType?: "diagnostic" | "tool" | "story";
  testVariable?: string;
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
  if (contentType === "tool") return "真实办公桌面上摊开一张手写判断表，旁边有电脑、便签和黑色签字笔";
  if (contentType === "story") return "清晨办公室窗边，一本打开的笔记本记录复盘，画面有真实过程感";
  return "中高层职场人的桌面判断场景，白纸上写着目标客户和下一步决策，电脑后台虚化";
}

export function buildCoverBrief(input: CoverBriefInput): CoverBrief {
  const coverText = (input.coverText || input.title).slice(0, 18);
  const scene = sceneForType(input.contentType);
  const visualStyle = "小红书真实过程感封面，克制高级，浅米色自然光，黑金点缀，非廉价模板，非大字报";
  const negativePrompt = "不要卡通，不要赛博朋克，不要夸张海报，不要无意义渐变，不要玄学符号，不要现金和暴富暗示";
  const audience = input.targetUser ? `目标用户：${input.targetUser}。` : "";
  const variable = input.testVariable ? `本图验证变量：${input.testVariable}。` : "";

  return {
    coverText,
    scene,
    visualStyle,
    negativePrompt,
    imagePrompt: `${scene}。${visualStyle}。${audience}${variable}画面适合叠加中文封面句「${coverText}」，预留上方或中间留白，9:16 竖版。`,
    overlayGuidance: `主标题不超过 12 字，建议使用「${coverText}」；副标题用于补充目标用户或判断场景。`,
  };
}
