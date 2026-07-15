import { buildBuyerCCoverOverlay, type BuyerCCoverOverlay } from "./coverComposition";
import { PARENT_RELAY_STRUCTURE_NAME } from "./buyerCStrategy";
import {
  buildParentRelayImagePrompt,
  extractParentRelayCoverFacts,
} from "./parentRelayCover";

export interface CoverBriefInput {
  title: string;
  body?: string;
  coverText?: string;
  targetUser?: string;
  contentType?: "diagnostic" | "tool" | "story";
  testVariable?: string;
  styleHint?: string;
  buyerC?: boolean;
  caseMode?: "真实案例" | "情景演绎";
  caseMaterial?: string;
  structureName?: string;
}

export interface CoverBrief {
  coverText: string;
  scene: string;
  visualStyle: string;
  negativePrompt: string;
  imagePrompt: string;
  overlayGuidance: string;
  overlay?: BuyerCCoverOverlay;
  imageLabel?: string;
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
    if (input.structureName === PARENT_RELAY_STRUCTURE_NAME) {
      const facts = extractParentRelayCoverFacts({
        body: input.body,
        coverText: input.coverText,
      });
      const relayPrompt = buildParentRelayImagePrompt(facts, input.styleHint);
      const overlay = buildBuyerCCoverOverlay(input);
      return {
        coverText: facts.headlineLines.join(" "),
        scene: relayPrompt.scene,
        visualStyle: relayPrompt.visualStyle,
        negativePrompt: relayPrompt.negativePrompt,
        imagePrompt: relayPrompt.imagePrompt,
        overlayGuidance: `文章已自动提取为“老二招聘现场＋老大Offer邮件”同框结构；GPT Image 2 会把“${overlay.venueBanner}”、叫号屏和手机里的脱敏Offer邮件直接融入现场，系统只稳定叠加橙红描边黄底两行大字与演绎标识，并标注“${relayPrompt.imageLabel}”。`,
        overlay,
        imageLabel: relayPrompt.imageLabel,
      };
    }
    const fictional = input.caseMode !== "真实案例";
    const material = input.caseMaterial?.trim() || "留学生家庭的两段求职经历";
    const overlay = buildBuyerCCoverOverlay(input);
    const scene =
      input.styleHint === "结果对照版"
        ? "真实校园招聘会入口的手机抓拍：一名成年留学生和家长站在入口侧面低头看手机，另一名成年留学生背着双肩包拿文件夹走向会场；背景有教学楼或企业园区建筑、入口台阶、路人、招聘帐篷、立式展架和一条长横幅，前景留出放置邮件卡片的空间"
        : "留学生家长站在校园招聘会入口外，从家长肩后视角拍到一名成年留学生背着双肩包、拿文件夹走上台阶进入会场；背景有教学楼或企业园区建筑、门厅、路人、招聘帐篷、立式展架和一条长横幅，前景左侧留出放置邮件卡片的空间";
    const visualStyle =
      "中国留学生家庭视角的手机纪实摄影，自然日光，轻微倾斜和抓拍感，曝光不完全均匀，边缘可有被截断的路人，人物为成年人；像真实家长在现场随手拍，不要影棚光、不要商业广告片质感、不要过度精修；建筑招牌区、入口横幅区、前景邮件卡片区和底部大标题区都要有清晰空间层次";
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
        ? `系统会稳定叠加“${overlay.companyLine}”现场招牌、脱敏Offer邮件卡片、橙红描边黄底两行标题，并保留“情景演绎 / 示意图”。`
        : `系统会从真实案例素材读取企业名，叠加“${overlay.companyLine}”现场招牌、脱敏Offer邮件卡片与橙红描边黄底两行标题；底图继续标注AI场景合成。`,
      overlay,
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
