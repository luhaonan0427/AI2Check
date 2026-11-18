# 公网部署记录

2026-11-18，Sites 发布成功，访问模式已由 owner-only custom 调整为 public。

- 主页：https://mathflow-teaching-0924.luhaonan0427.chatgpt.site
- 学生端：主页后加 `/student`
- 教师端：主页后加 `/teacher`
- 托管项目：`appgprj_6ab4af26401c8191adaaa1765c062b09`
- 部署版本：`appgprj_6ab4af26401c8191adaaa1765c062b09~appgver_ee9da76b010c8191bbe77603dffdc4a3`
- 源码提交：`c3a533c70b776b3b8caa0d25d300d79235368524`
- GitHub 正式部署分支：`codex/production-deploy`
- 本机托管源码目录：`.sites-runtime/hosted-source/.sites-checkout`（忽略目录，源码已在云端仓库和上述 GitHub 分支保存）。

## 数据与权限

正式数据库原有的是未加前缀的 accounts/classes/courses 等表，与本地 main 的历史迁移不同。因此保留托管仓库已应用的 0000、0001_funny_speed、0002_nappy_lady_vermin；新增 0003_loose_paladin，仅创建 campus_ 系列表，没有删除或覆盖旧表。

不要直接把 main 分支的 drizzle 目录覆盖到正式部署分支。正式 Drizzle 配置同时读取 db/hosted-legacy-schema.ts 和 db/campus-schema.ts。原账号在密码校验通过后按需接续到新版；原账号表保留。

生产 LOCAL_DEMO=false；旧演示 API 和 /demo 由 middleware 停用。管理员邮箱为网站所有者的真实邮箱，AI 配置通过 Sites 运行时 secret 保存，未放入源码或部署归档。

所有者首次进入：展开「网站所有者入口」，使用本人 ChatGPT 身份验证，返回后点击「已验证，进入管理」。学生、教师使用平台独立账号；新增教师仍需管理员审核。

## 验证范围与访问限制

类型检查、班级/名单/权限/期限测试、模拟 AI 测试、生产构建均通过。Sites 返回部署 succeeded、运行时配置 revision=2；上线后确认 campus_ 表已创建、旧表仍保留、访问模式为 public。

当前电脑直接请求公网地址返回 Cloudflare 的 403 防护页，未到达应用；普通内置浏览器访问也超时。公网页面和匿名 API 权限因此尚未完成端到端验证。不能据此声称所有地区/校园网络均可访问。该限制来自托管入口，需要平台网络支持或改用可达的托管环境；不能通过修改学生权限来解决。
