**Design QA：对标法真实标题选择器**

- source visual truth path: `/Users/qifeng/Documents/New project 2/output/audits/benchmark-ui-2026-08-02/04-benchmark-card.png`
- implementation screenshot path: `/Users/qifeng/Documents/New project 2/.codex-worktrees/benchmark-direct-source-title/output/benchmark-ui-local-card.png`
- source pixels: `1904 × 1071`
- implementation pixels: `1274 × 717`
- CSS viewport: 本地 Codex 浏览器桌面视口约 `1274 × 717`
- density normalization: 两张证据均按浏览器 CSS 比例查看；比较信息层级、交互顺序和响应式结构，不做逐像素复刻。源图与实现图已在同一比较输入中并列检查。
- state: 本地脱敏 fixture；留学生业务 × 买家视角 × 留学生家长号；对标法已选中；首个真实标题可用。

**Full-view comparison evidence**

- 旧版首屏以来源维护、暂停原因和重复错误提示为主，真实标题及主操作不突出。
- 新版默认进入对标法，先显示“真实原标题 → 来源摘要 → 为什么推荐 → 选用这个标题”，来源维护被后置到折叠详情。
- 页面仅保留一个顶端批量入口和一个底部持续操作入口，卡片内只保留单条“换一个”，没有同区域重复批量按钮。

**Focused region comparison evidence**

- 已聚焦比较第一张真实标题卡：标题字号、来源元数据、匹配标签、推荐解释、主次按钮和底部操作条均可清晰读取。
- 空状态通过 DOM 复核：每个无结果槽位只显示一次状态、一次原因、一次保证和两个恢复动作，不再叠加多层告警。

**Required fidelity surfaces**

- Fonts and typography: 沿用线上中文字体与字号体系；标题、元数据、解释和操作形成四级层次，长标题可在输入框内编辑，不截断关键内容。
- Spacing and layout rhythm: 真实标题卡内部顺序稳定，推荐解释与操作分组明确；主按钮前置，来源维护后置；桌面卡片无重叠和横向溢出。
- Colors and visual tokens: 沿用线上浅色底、深色主按钮、绿色可访问状态与暖色推荐标识；语义颜色一致，未引入新品牌视觉。
- Image quality and asset fidelity: 本流程无图片或品牌资产，不存在占位图、CSS 图形替代或压缩失真问题。
- Copy and content: 文案改为用户任务语言——“真实原标题”“为什么推荐”“选用这个标题”“换一个”；删除了把后台规则暴露给普通用户的重复说明。
- Accessibility: tab 保留 `aria-selected`；空状态使用 `role=status`/`aria-live`；按钮保持不小于 44px 的可点击高度；输入框有明确无障碍名称。

**Primary interactions tested**

1. 留学生业务 × 买家：进入选题默认看到对标法，选择真实标题后底部进入生成正文状态。
2. 留学生切到中高管业务：对标法仍默认选中，推荐标签和标题同步切换到中高管业务。
3. 中高管买家切到商家：账号人设、视角标签和真实标题同步更新，无跨业务、跨视角串线。
4. 原生法可手工切换；业务、视角或账号变化后重新回到默认对标法。
5. 来源详情可展开，原链接、刷新校验和手工来源仍可用。
6. 生产站发现旧批次仍可能携带“迁移标题结构”记录；已改为隔离旧迁移标题，只允许 `direct_source` 且标题等于来源原标题的卡片进入可选择状态。

**Console/runtime check**

- 本地 Next.js 编译、页面请求与 fixture API 返回正常；浏览器页面无错误页、无未处理弹窗、无可见运行时告警。

**Findings**

- 无剩余 P0/P1/P2 问题。

**Comparison history**

- Pass 1：发现旧版来源维护和重复暂停信息压过标题选择，且默认首先显示原生法。
- Fix：默认视图改为对标法；真实原标题与“选用这个标题”前置；匹配依据显性化；来源维护折叠；空状态合并；切换业务/视角/账号后默认回到对标法。
- Pass 2：发现对标区标题旁仍有一个批量按钮，与页面顶部批量按钮重复。
- Fix：删除对标区重复批量按钮；保留顶端批量入口、卡片单条换题和底部持续操作入口。
- Pass 3（生产小流量验收）：发现一个历史批次仍展示旧迁移标题和“只迁移标题结构”说明，与真实原标题直用规则冲突。
- Fix：历史迁移标题不再作为可选择标题展示；卡片提示“旧版迁移标题已隔离”，并提供“按新规则找题”；新直用标题的推荐依据始终明确为“直接采用原标题”。
- Post-fix evidence：`benchmark-ui-local-card.png`、本地三轮 DOM/交互复核及生产站留学生买家、中高管商家路径复核。

**Implementation Checklist**

- [x] 对标法成为进入选题页的默认第一视图。
- [x] 原生法保留为用户主动切换项。
- [x] 真实原标题成为卡片视觉主角。
- [x] 业务、视角、账号人设匹配依据可见。
- [x] 来源维护和高级操作后置。
- [x] 空状态只出现一次且可恢复。
- [x] 单条换题、批量换题和选用标题的职责分离。

**Follow-up Polish**

- P3：后续有足够真实数据后，可以用“用户最终选择率”校准推荐序号，但本次不引入模型评分或额外等待。

final result: passed
