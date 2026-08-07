# Frontend-Oriented Fullstack Resume Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 更新现有 Word 简历，使其准确呈现“全栈开发工程师（前端方向）”定位，并把 AIGC Creative Studio 作为首个核心项目。

**Architecture:** 保留现有简历的单列结构、工作经历与联系方式，只在标题、个人概况和核心项目区块做局部文字更新。使用 python-docx 编辑原始 DOCX，然后用 LibreOffice 渲染每一页 PNG 做视觉验收。

**Tech Stack:** DOCX、python-docx、LibreOffice render_docx.py。

## Global Constraints

- 只修改用户提供的前端偏全栈 DOCX，不改变工作经历、教育经历或联系方式。
- 项目表述必须与当前 AIGC Creative Studio 仓库能力一致，不虚构线上部署、用户量或性能数据。
- React/TypeScript 与前端交互能力排在 Node.js（Express / NestJS）、数据库和 API 能力之前。
- 每轮内容改动后必须渲染为 PNG，并检查全部页面。

---

### Task 1: 定向更新简历内容

**Files:**
- Modify: `C:/Users/30829/Desktop/李晨阳-前端偏全栈开发工程师-简历.docx`
- Create: `C:/Users/30829/Desktop/李晨阳-前端偏全栈开发工程师-简历-更新版.docx`

**Interfaces:**
- Consumes: 已有标题、个人概况、核心项目段落，以及仓库中的 `README.md`、`server/sql/schema.sql`。
- Produces: 内容更新后的 DOCX；AIGC 项目处于“核心项目”首位。

- [ ] **Step 1: 备份并读取原始段落**

使用 python-docx 读取所有非空段落；复制原始文件到“更新版”路径，后续仅编辑复制件。

```python
from docx import Document
from pathlib import Path
import shutil

source = Path(r"C:/Users/30829/Desktop/李晨阳-前端偏全栈开发工程师-简历.docx")
target = source.with_name("李晨阳-前端偏全栈开发工程师-简历-更新版.docx")
shutil.copy2(source, target)
document = Document(target)
paragraphs = [paragraph.text for paragraph in document.paragraphs if paragraph.text.strip()]
assert "核心项目" in paragraphs
```

- [ ] **Step 2: 更新职位标题和个人概况**

将标题改为“全栈开发工程师（前端方向） · React / TypeScript / Node.js · HarmonyOS 跨端经验”。将个人概况改为先描述 React、TypeScript、前端交互与工程化，再描述 NestJS/Express、PostgreSQL/MySQL、REST API、AI 工作流和独立交付能力。

```python
replacements = {
    "前端 / 全栈开发工程师  ·  React / TypeScript / NestJS  ·  HarmonyOS 跨端经验": "全栈开发工程师（前端方向）  ·  React / TypeScript / Node.js  ·  HarmonyOS 跨端经验",
    "具备 React、TypeScript 与 NestJS 全栈开发经验，参与企业数据运维平台开发，可独立完成前端页面、REST API、数据库访问、AI 工作流、SSE 流式交互及 Docker 部署。当前从事 HarmonyOS Web 容器与跨端框架维护，兼具复杂问题定位、TypeScript SDK 和跨端通信能力。": "以 React、TypeScript 前端开发为主，具备复杂交互、状态管理、接口联调与工程化实践经验；同时能够使用 NestJS / Express、PostgreSQL / MySQL 完成 REST API、鉴权、数据库访问和 AI 工作流的前后端闭环。当前从事 HarmonyOS Web 容器与跨端框架维护，兼具复杂问题定位、TypeScript SDK 和跨端通信能力。",
}
```

- [ ] **Step 3: 将 AIGC Creative Studio 插入核心项目首位**

在“核心项目”标题后插入项目标题和四条描述；项目名称、技术栈和内容固定如下，避免夸大。

```text
AIGC Creative Studio｜全栈图片创作与编辑平台  |  React / TypeScript / Express / PostgreSQL / Canvas 2D / Vitest / GitHub Actions
负责 React 创作台、任务轮询、生成库、按用户隔离的数据展示与 Canvas 图片编辑器；实现灰度、渐变、雨滴、色彩涟漪及 PNG / WebM 导出等前端交互。
使用 Express 设计生成任务、图片资源、下载、编辑保存与用户鉴权接口；对接异步图片生成 Provider，处理任务状态、失败反馈和本地图片访问。
使用 PostgreSQL 建模 users、generation_tasks、images、activity_logs，建立用户、生成任务、图片与活动记录的关系；图片元数据持久化，文件受用户身份约束访问。
补充前后端 Vitest 测试、Supertest 接口测试与 GitHub Actions CI；支持本地 Docker PostgreSQL 一键启动及项目演示视频。
```

- [ ] **Step 4: 精简重复表述并保存**

保留政务案件系统与车辆管理系统，删除或合并“代表性工程实践”中与新项目重复的泛化用语，确保新增项目后的篇幅不造成无意义重复。保存更新版 DOCX。

```python
document.save(target)
assert target.exists()
```

- [ ] **Step 5: 结构检查**

重新读取更新版，确认标题、AIGC 项目名和全部四个表名存在，且工作经历标题仍然存在。

```python
updated = Document(target)
text = "\n".join(paragraph.text for paragraph in updated.paragraphs)
for expected in ("全栈开发工程师（前端方向）", "AIGC Creative Studio", "generation_tasks", "activity_logs", "工作经历"):
    assert expected in text
```

### Task 2: 渲染与视觉验收

**Files:**
- Modify: `C:/Users/30829/Desktop/李晨阳-前端偏全栈开发工程师-简历-更新版.docx`
- Create: `%TEMP%/aigc-resume-render/page-*.png`（内部验收文件，不交付）

**Interfaces:**
- Consumes: Task 1 生成的更新版 DOCX。
- Produces: 已通过全页视觉检查的最终 DOCX。

- [ ] **Step 1: 渲染更新版 DOCX**

使用 documents 技能提供的渲染器输出所有页面 PNG。

```powershell
& $python "$documentsSkillRoot\render_docx.py" `
  "C:\Users\30829\Desktop\李晨阳-前端偏全栈开发工程师-简历-更新版.docx" `
  --output_dir "$env:TEMP\aigc-resume-render" --emit_pdf
```

- [ ] **Step 2: 检查每页 PNG**

逐页检查标题、项目区块、技术栈、工作经历和教育经历：不得出现文字裁切、重叠、乱码、异常分页或表述截断。

- [ ] **Step 3: 如有版式问题则局部修正并重新渲染**

只调整新增 AIGC 项目的文字密度、段前段后间距或相邻重复段落；不改变原有简历视觉体系。

```python
# 仅当渲染发现溢出时，缩短新增项目的第四条为：
# "补充前后端 Vitest/Supertest 测试与 GitHub Actions CI，支持本地 Docker PostgreSQL 启动及演示视频。"
```

- [ ] **Step 4: 最终交付检查**

确认最终 DOCX 可打开、全部页面已审阅，并仅交付更新版 DOCX。
