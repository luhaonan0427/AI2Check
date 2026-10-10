# AI2Check · 数研 MathFlow

为数学学院设计的作业教学平台：教师发布作业与评分标准，学生拍照提交，模型识别解题过程并逐页逐行给出建议，教师确认成绩，平台汇总多轮平时作业得分。

教师端与学生端分别位于 `/teacher`、`/student`，各自拥有页面、组件和样式，使用同一个服务端与数据库，已经整合成一个网站。学生通过教师提供的课程码接收该课程的作业。

## 已实现

- 教师：创建课程、课程码邀请、作业题目与评分标准、满分和权重设置、原图对照审核、改分定稿、分类筛选、逐轮成绩表、加权平时分和CSV导出。
- 学生：加入课程、最多5页照片上传、查看作业与提交状态、教师定稿反馈、AI逐题评分和逐行定位、原图标记、分层订正提示、订正问答、巩固/提高/拓展题。
- AI：服务端 OpenAI Responses API，图片输入与严格JSON结构；校验满分和得分之和、扣分、页码与定位框；调用失败保留照片与待批改记录，支持重试或教师手动审核。
- 权限：角色由服务端授权；学生只能读自己的提交、原图和订正，教师只能审核自己课程。

**真实AI功能需要服务端密钥与模型配置。** 未配置时不会生成演示分数或虚构行号。学生仍可上传，教师仍可手动审核，成绩统计正常可用。

## 本地运行（Windows）

需要 Node.js >=22.13。当前项目已安装依赖并初始化本地数据库。启动：

```powershell
node scripts/run-framework.mjs dev
```

打开 `http://localhost:5173/welcome`，欢迎页提供独立的本地教师、学生体验入口。这些模拟身份仅限本机开发，不包含在生产构建的登录流程中。

新电脑首次克隆时先安装依赖：

```powershell
npm run install:ci
```

如果这台Windows电脑的 `npm` 命令路径异常，使用：

```powershell
node 'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js' run install:ci
```

首次运行在另一个终端执行：

```powershell
node scripts/setup-local.mjs
```

初始化会触发本地数据库创建，再依次应用 `drizzle/` 的迁移；已有数据库保留原数据，不重复应用迁移。本地数据库和上传照片保存在忽略的 `.wrangler/`，不会进入Git。

## 配置真实图片批改和订正问答

复制 `.dev.vars.example` 为 `.dev.vars`，填写：

```dotenv
OPENAI_API_KEY=你的服务端API密钥
OPENAI_MODEL=账户可用且支持图片输入和结构化输出的模型名称
TEACHER_EMAILS=teacher@sites.test
```

修改后重启开发服务。密钥只由服务端读取，`.dev.vars` 已被Git排除，不要在网页、聊天或源码里填写密钥。本机网络需能连接 `https://api.openai.com/v1/responses`；API调用的账户权限和费用由使用的服务账号决定。

批改用学生照片、题目和评分标准；问答用本份作业的反馈与订正历史。请求设置 `store:false`，不把学生姓名、邮箱和学号作为批改提示发送。图片自身如果包含身份信息也会作为图片输入发送。

教师账号首次建档时按 `TEACHER_EMAILS` 授权，逗号分隔；其他账号默认为学生。上线时应配置真实教师邮箱。既有账号的角色保存在 `users` 表，修改白名单不会自动变更已有角色。

使用的官方接口文档：[图片输入](https://developers.openai.com/api/docs/guides/images-vision)、[结构化输出](https://developers.openai.com/api/docs/guides/structured-outputs)。

## 成绩规则

- 满分为全对，零分为全错，其余为部分正确。
- 最终成绩只采用教师已定稿的分数；AI建议不会自行成为正式成绩。
- 平时成绩 = `Σ(定稿分 / 当轮满分 × 100 × 权重) / Σ已定稿轮次权重`。
- 例如88/100权重1、20/40权重2：`(88 + 50×2)/3 = 62.67`。
- 未提交和未审核不自动记零，尚有缺项时标为“暂定”；缺交记零需由教师按教学规则处理。
- 重新提交会替换本轮照片与评分、清空本轮订正历史并重新进入审核流程。

## 验证与构建

```powershell
node node_modules/typescript/bin/tsc --noEmit
node scripts/test-ai.mjs
node scripts/test-workflow.mjs
node scripts/test-security.mjs
node scripts/run-framework.mjs build
```

工作流和权限测试需要本地服务，使用模拟账号写入本地测试数据。工作流测试在**没有配置真实模型**的开发环境运行，验证未配置AI时的保存、手动审核和多轮统计。AI契约测试使用合成模型响应，验证接口与校验逻辑，不调用付费服务，不证明手写识别准确率。

## 维护位置

| 功能 | 位置 |
| --- | --- |
| 教师页面与组件 | `app/teacher/` |
| 学生页面与组件 | `app/student/` |
| 原图与问答共享组件 | `app/shared/` |
| 真实批改与输出校验 | `app/grader.ts`、`app/ai/` |
| 提交、问答、课程与统计接口 | `app/api/` |
| 数据访问与成绩规则 | `db/store.ts` |
| 数据库迁移 | `drizzle/` |
| 接口与迁移说明 | `docs/` |

## 当前边界与部署

目前完成的是新Git仓库中的可运行版本与本地预览。GitHub存放源码，推送GitHub不会自动发布网站。保留旧Sites托管声明供之后部署兼容使用，本次没有修改旧站的线上数据。

生产构建目标是 Cloudflare Worker + D1 + R2。现有登录依赖Sites可信代理注入的ChatGPT身份；若换用独立托管，需要配置可信身份代理或学校SSO，不能把开发服务直接公开。正式平台的访问策略、教师授权和API密钥需要与学校使用环境一起配置。

行号按上传页序、每页从上到下计数。手写数学、复杂排版和模糊照片可能导致识别或框定位偏差；不确定结果会提醒教师核查。正式使用前需配置模型并用教师已批改的作业验证识别和评分。当前未实现批改任务队列、批量通知、学生名单导入或原生App。

旧源目录保持原状；未迁移旧本地数据库和照片。详见 [迁移记录](docs/迁移记录.md)。
