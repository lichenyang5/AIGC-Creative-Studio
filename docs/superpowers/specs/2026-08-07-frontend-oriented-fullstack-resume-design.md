# 前端方向全栈简历调整方案

## 目标

将简历定位统一为“全栈开发工程师（前端方向）”。以 React、TypeScript、复杂交互和前端工程化为主线，用 Node.js（Express / NestJS）、关系型数据库、鉴权与 AI 任务链路证明能够独立完成前后端闭环。

## 范围

仅修改 `李晨阳-前端偏全栈开发工程师-简历.docx`：

- 调整职位标题与个人概况的能力排序；
- 在“核心项目”首位新增 AIGC Creative Studio；
- 为该项目补充真实可追问的前端、后端、数据库与工程化成果；
- 精简与项目内容重复的措辞。

不修改工作经历、教育经历、联系方式、项目事实、技术栈真实性或 GitHub/B 站链接。

## 内容设计

### 标题与个人概况

标题使用“全栈开发工程师（前端方向）”，并保留 React、TypeScript、Node.js 关键词。个人概况先说明 React/TypeScript 前端开发、复杂状态与交互实现能力，再说明 NestJS/Express、PostgreSQL/MySQL、REST API 与 AI 工作流交付能力。

### AIGC Creative Studio 项目

放在“核心项目”首位，技术栈为 React、TypeScript、Express、PostgreSQL、Canvas 2D、Vitest、GitHub Actions。项目描述限定为以下真实能力：

1. 前端完成生成参数、任务状态轮询、图片库、用户数据隔离展示与 Canvas 编辑器；
2. Express 对接异步图片生成 Provider，处理创建、查询、失败、安全下载及本地图片访问；
3. PostgreSQL 通过 users、generation_tasks、images、activity_logs 建立用户、任务、图片与活动关系；
4. 实现图片编辑与导出，覆盖灰度、渐变、雨滴、色彩涟漪等 Canvas 效果，并配置前后端测试及 GitHub Actions CI。

不声明线上生产部署、性能指标、商业用户量或未实现的功能。

## 版式与验证

保持原有单页/现有视觉风格，仅做局部文字替换和项目区块插入；避免改变联系方式、工作经历和教育区块的布局。完成后使用 DOCX 渲染为页面 PNG，逐页检查标题层级、换行、溢出与间距。

## 验收标准

- 简历能明确表达“全栈偏前端”定位；
- AIGC 项目内容与仓库现状一致；
- 技术关键词可被 ATS/招聘方快速识别；
- 所有页面渲染后无文字裁切、重叠或异常分页。
