# 明日之星 · Stars of Tomorrow

一套可自行部署的团队欣赏与现场互动系统。它把“看见彼此的贡献”变成一场完整活动：成员写下真实欣赏，组织者截止并固定内容，再通过三个小游戏、总排名和颁奖共同回顾团队中的善意与努力。

适合部门团建、年度回顾、团队答谢、跨项目组协作复盘等场景。公开仓库只包含通用代码、虚构示例与活动方法，不包含任何真实活动数据。

## 活动流程

```text
写欣赏 → 结束收集并固定快照 → 关键词审核 → 真心话抢答
      → 全民预言家 → 欣赏连连看 → 总分排名 → 现场颁奖
```

### 对普通成员

- 按选区与姓名登录，修改自己的密码；
- 给一位或多位同事写欣赏，也允许自荐；
- 每张卡独立设置署名或匿名，草稿自动保存到服务端；
- 收集开放期间可修改正式稿，截止后最终锁定；
- 用手机或电脑参加三个游戏，并查看个人得分和现场结果。

### 对组织者

- 查看本选区正式提交、欣赏卡和操作审计；
- 一键截止收集，固定不可变快照；
- 使用兼容 OpenAI 接口的大模型生成四字关键词建议，人工合并、改名后再发布；
- 按被欣赏人筛选抢答题卡，控制作答、揭晓和环节顺序；
- 区分试玩与正式成绩，可单独清理试玩游戏数据而保留欣赏卡；
- 按三个游戏的实际总分生成完整排名与颁奖名单，并导出 JSON／CSV。

## 三个小游戏

| 游戏 | 核心玩法 | 计分 |
| --- | --- | --- |
| 真心话抢答 | 看欣赏正文，猜“这段话写给谁”，不是猜作者 | 30秒内作答；答对100分，最高加20分速度奖励 |
| 全民预言家 | 从候选词中选3个，预测真实频次Top 5 | 每个命中100分，三个全中额外300分；第五名同频并列均计入 |
| 欣赏连连看 | 将本人收到的欣赏卡连接到作者；匿名卡连接“匿名” | 第1/2/3次连对得100/80/60分；全部一次连对额外300分；全场120秒 |

颁奖依据是**游戏总分**，不是收到欣赏卡的数量。匿名卡的作者不会通过真心话或连连看被公开。

## 快速开始：本地演示

### 准备环境

- Node.js 22或兼容的新版本；
- Docker Desktop（提供MySQL 8.0）；
- Git。

### 启动

在项目根目录执行：

```bash
npm ci
npm run setup:env
docker compose -f deploy/compose.yaml up -d db
npm run db:migrate
npm run provision:demo
npm run dev
```

打开 http://localhost:3000 。

`setup:env` 会生成带随机密钥的本地 `.env`，不会覆盖已有文件，也不会打印密钥。数据库迁移只创建结构；演示初始化只创建虚构团队与账号，不自动填写欣赏卡、成绩或获奖者。

### 演示账号

选择选区 **“示例团队”**：

| 角色 | 姓名 | 公开演示密码 |
| --- | --- | --- |
| 普通成员 | 陈晨 | `Demo1234` |
| 普通成员 | 林晓星 | `Demo1234` |
| 组织者 | 组织者 | `Organizer1234` |

全部6名虚构成员均使用同一个演示密码。**这些密码只用于本地体验，不能用于公开部署或真实活动。**

如需体验完整流程，可分别登录虚构成员，填写并提交虚构欣赏，再由组织者截止、生成关键词并推进游戏。没有配置模型密钥时，书写、收集、截止、账号与大屏仍可使用；完整“全民预言家”需要可用的模型服务或其他受支持的关键词数据来源。

## 用于自己的团队

1. 修改 `contracts/constants.ts` 中的 `DISTRICTS`、`DEFAULT_DISTRICT_ID` 和 `MEMBERS`；
2. 保留每名成员唯一、稳定的ASCII排序键 `pinyinKey`；
3. 初次初始化使用 `npm run provision`，不要使用 `provision:demo`；
4. 在本地私有目录 `runtime-credentials/` 获取随机初始密码清单；
5. 将密码通过安全渠道分别发给成员，并要求首次登录后修改。

初始化工具不会重置已存在账号的密码。重复运行不会把已有密码写回清单。默认配置面向一个团队；若要为多个相互隔离的团队同时服务，请先阅读部署文档并扩展名单配置，不要把不同公司或无关团队放进同一个数据库。

详细说明：

- [活动方案与主持手册](docs/activity-playbook.md)
- [普通成员与组织者使用指南](docs/user-guide.md)
- [配置、Docker部署、HTTPS与备份](docs/deployment.md)
- [安全与隐私边界](SECURITY.md)

## 全Docker运行

```bash
npm run setup:env
docker compose -f deploy/compose.yaml build app
docker compose -f deploy/compose.yaml run --rm app node dist/migrate.js
docker compose -f deploy/compose.yaml run --rm app node dist/provision.js --demo
docker compose -f deploy/compose.yaml up -d app
```

然后打开 http://localhost:3000 。正式团队初始化、域名和HTTPS配置见[部署文档](docs/deployment.md)。

## 大模型配置

默认使用 DeepSeek 的 OpenAI 兼容接口。在服务器受保护的 `.env` 中设置：

```dotenv
LLM_API_KEY=你的密钥
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-flash
```

模型请求只包含固定快照的卡ID与正文，不包含作者元数据。模型只生成建议；服务端校验卡ID、按卡去重计频，组织者必须审核并手动发布。请根据所在组织的数据制度决定是否及如何使用外部模型服务。

## 技术栈与目录

React、TypeScript、Vite、Hono、tRPC、Drizzle ORM、MySQL 8.0、Docker Compose。前端动效主要使用CSS与inline SVG，不需要额外的大型动效依赖。

```text
api/                 服务端、鉴权、游戏与关键词逻辑
contracts/           前后端共享规则与演示名单
src/                 React页面与视觉组件
db/schema.ts         数据库结构
db/migrations/       可重复执行的正式迁移
db/provision.ts      通用账号与选区初始化
deploy/              Docker Compose与Caddy
scripts/             本地环境生成与生产启动
docs/                 活动和使用文档
```

## 验证

```bash
npm run check
npm test
npm run build
```

GitHub Actions会对 `main` 分支和Pull Request执行相同检查。数据库与浏览器端到端验证仍应在目标部署环境完成；构建成功不等于现场活动已经验收。

## 许可与贡献

代码与文档采用 [MIT License](LICENSE)。欢迎提交脱敏后的改进。请不要在Issue、PR、截图或测试数据中加入真实评语、匿名作者关系、账号密码、API Key或数据库备份。
