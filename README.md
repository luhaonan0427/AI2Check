# AI2Check · 数研 MathFlow

两个项目已整合为这一份代码、一个安装目录、一套运行服务与一个统一教学入口。

- `http://localhost:5173/`：独立账号登录、注册及恢复；登录后按服务端身份显示教师、学生或管理员工作台。
- `/teacher`、`/student` 和原课程链接：进入同一套工作台。
- `/welcome`：平台介绍。
- `/demo`：保留原项目的个人试用版，标明虚构示例，与正式班级数据分开。

## 合并后的功能

教师创建课程和教学班，分享10位班级码，审核学生入班，再发布题目、评分标准、截止时间、满分、权重及补交规则。教师身份由管理员审核；注册不能自行获得教师或管理员权限。

学生使用独立账号，无需ChatGPT账号。每份作业可提交文字或最多10张照片，每张8MB内；可查看教师反馈、退回订正、再次提交及完整历史。

配置OpenAI服务端密钥与模型后，可获得逐题建议分、页码与行号定位、原图错误框、订正提示、辅导问答以及巩固/提高/拓展题。AI照片输入总大小不超过16MB；文字作答也可批改。未配置或失败时保留提交，支持重试与人工审核。AI建议分与教师定稿分分开存储，正式统计只使用已定稿分。

全对为满分、全错为零分、其余为部分正确。平时分先按各轮满分归一化，再按权重汇总；未提交、待批改和退回订正不自动记零，阶段均分与批改进度一起显示。支持CSV导出。

## 本地启动

Node.js >=22.13。当前目录依赖和数据库已就绪：

```powershell
node scripts/run-framework.mjs dev
```

新电脑先安装、启动，再在另一终端初始化数据库：

```powershell
npm run install:ci
node scripts/run-framework.mjs dev
# 在另一终端运行
node scripts/setup-local.mjs
```

本机若npm命令路径异常，使用 `node 'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js' run install:ci`。

## 账号与模型配置

复制 `.dev.vars.example` 为 `.dev.vars`，配置 `OPENAI_API_KEY`、账户可用且支持图片和结构化输出的 `OPENAI_MODEL`，然后重启。密钥只由服务端读取，该文件已被Git排除。调用路径沿用 [图片输入](https://developers.openai.com/api/docs/guides/images-vision) 和 [结构化输出](https://developers.openai.com/api/docs/guides/structured-outputs) 官方接口。

普通师生在首页注册。教师在“账号设置”申请，管理员核实后通过。`ADMIN_EMAIL` 指定可信ChatGPT身份的所有者邮箱；网站所有者在登录页“网站所有者入口”验证身份，再启用管理账号。正式环境必须填写真实所有者邮箱，本地默认允许模拟 `teacher@sites.test` 身份。

原AI2Check账号的课程和成绩已迁移。在登录页展开“网站所有者入口”，先验证原ChatGPT身份，再点“接续已迁移的原账号与课程”。本地教师身份验证地址：`/signin-with-chatgpt?as=teacher&return_to=/`，学生为 `as=student_a`。该模拟身份仅限开发。

源项目已有的独立账号及密码哈希已在本机导入，使用原用户名和密码登录。原登录会话未导入，需重新登录。恢复码仅在注册或恢复时显示一次，服务端不存明文密码和恢复码。

本地库包含开发和验收测试数据，预览中的示例姓名及分数不代表真实学生成绩。

## 数据合并与维护

来源为 `C:/Users/HP/Desktop/自主批改作业/mathflow`，原目录保持原状。相同公共组件去重；账号、班级、审批、提交历史与补交流程接入原AI2Check的AI批改和订正能力。详细清单见 [项目合并报告](docs/项目合并报告.md)。

两套旧数据库存在同名但结构不同的表。新平台使用 `campus_*` 表，原表作为兼容与历史数据保留；`0003`至`0005`是增量迁移。原AI2Check课程、成员、作业、定稿分、AI载荷及订正记录已复制到统一模型，原图通过存储路径映射读取。新操作统一使用 `/api/account`、`/api/campus` 及其子接口。

源项目的本地独立账号、课程、班级、成员、作业、提交及历史、照片也已导入。导入前的数据库备份在忽略的 `.sites-runtime/backups/`；本地数据库、照片、会话、缓存和密钥不会进入Git。

再次导入旧本地项目需先停止本地服务，再运行：

```powershell
node scripts/import-campus-local.mjs 'C:/Users/HP/Desktop/自主批改作业/mathflow'
```

导入只读源目录、先备份目标、遇到同编号且内容不同的记录会停止，不覆盖新改动；会话和限流计数不导入。该脚本针对本地D1/R2，不能用于线上数据库。

## 验证

```powershell
node node_modules/typescript/bin/tsc --noEmit
node scripts/test-campus.mjs
node tests/merge-migration.test.mjs
node scripts/test-ai.mjs
node tests/http-smoke.mjs
node scripts/run-framework.mjs build
```

HTTP测试需要启动本地服务，创建独立的本地测试账号及作业。其余测试使用内存SQLite或合成AI响应，不调用付费模型。原 `scripts/test-workflow.mjs`、`test-security.mjs` 和 `test-pages.mjs` 保留为旧接口/旧界面的回归参考，不是新版页面验收脚本。GitHub检查包含类型检查、账号班级测试、迁移测试、AI契约和生产构建。

## 主要代码

| 功能 | 位置 |
| --- | --- |
| 统一账号及师生工作台 | `app/campus.tsx`、`app/campus.css` |
| 身份、班级、审批与提交历史 | `lib/campus.ts`、`lib/campus-service.ts` |
| 图片批改和评分校验 | `app/grader.ts`、`app/ai/`、`lib/campus-ai.ts` |
| 原图反馈与订正问答 | `app/shared/`、`app/api/campus/tutor/` |
| 统一数据库结构 | `db/campus-schema.ts`、`drizzle/` |
| 原个人试用版 | `app/demo/`、`app/workspace.tsx`、`db/demo-store.ts` |

目前未配置真实模型，未实测手写识别精度。服务端接口、权限、迁移与本地流程已验证。正式使用仍需用教师已批改的作业检验识别、定位及评分偏差。

本次为本地项目与Git仓库合并，未修改旧站线上数据。两个旧项目曾沿用同一Sites项目ID但数据库迁移谱系不同；上线前需核对线上真实表结构和已应用迁移，不能将本地合并通过视作线上已更新。
